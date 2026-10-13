-- Coach <-> client relationship lifecycle.
--
--   pending   -> accepted   client accepts            respond_to_invite(id, true)
--   pending   -> declined   client declines           respond_to_invite(id, false)
--   pending   -> cancelled  coach withdraws           cancel_invite(id)
--   accepted  -> ended      either party ends it      end_relationship(id)
--   declined / ended / cancelled -> pending            invite_client(username), needs fresh consent
--
-- Rows are no longer deleted: ending keeps the row, stamped with who ended it and when, and
-- training access stops immediately (can_read_training requires status = 'accepted').
--
-- M1 stores only the LATEST lifecycle state per coach/client pair. Re-opening a link overwrites the
-- previous accepted_at / ended_at / ended_by, so this is not a full audit trail; an event history
-- is deferred.
--
-- Programmes already delivered to a client stay readable by that client after the relationship
-- ends: programme access is a different permission from client-training access.

alter table public.coach_client_links
  add column ended_at timestamptz,
  add column ended_by uuid references public.profiles (id) on delete set null;

create index coach_client_links_ended_by_idx on public.coach_client_links (ended_by)
  where ended_by is not null;

alter table public.coach_client_links drop constraint coach_client_links_status_check;
alter table public.coach_client_links
  add constraint coach_client_links_status_check
    check (status in ('pending', 'accepted', 'declined', 'ended', 'cancelled')),
  -- ended_at is set exactly when the relationship has ended
  add constraint coach_client_links_ended_consistency
    check ((status = 'ended') = (ended_at is not null));

-- No direct deletes any more: ending goes through end_relationship() so the row is kept.
-- (Deleting a profile still cascades to its links; that is a foreign-key action, not a grant.)
drop policy "links_delete_as_either" on public.coach_client_links;
revoke delete on public.coach_client_links from authenticated, anon;

-- A single conditional upsert: re-opens only a declined/ended/cancelled link. If the link is
-- pending or accepted the update is skipped, no row is touched and we report it. Two concurrent
-- invitations cannot both succeed because the unique pair key serialises them.
create or replace function public.invite_client(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  touched int;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;
  select id into target from profiles
    where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username'; end if;
  if target = auth.uid() then raise exception 'You can''t invite yourself'; end if;

  insert into coach_client_links (coach_id, client_id) values (auth.uid(), target)
  on conflict (coach_id, client_id) do update
    set status = 'pending', created_at = now(), accepted_at = null, ended_at = null, ended_by = null
    where coach_client_links.status in ('declined', 'ended', 'cancelled');

  get diagnostics touched = row_count;
  if touched = 0 then raise exception 'You''ve already invited this user'; end if;
end;
$$;

-- Client answers an invitation. Repeating the answer that was already given is a no-op; the opposite
-- answer after the fact is an error.
create or replace function public.respond_to_invite(p_link_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  l coach_client_links;
begin
  select * into l from coach_client_links
    where id = p_link_id and client_id = auth.uid() for update;
  if not found then raise exception 'Invite not found'; end if;

  if l.status = 'pending' then
    update coach_client_links
      set status = case when p_accept then 'accepted' else 'declined' end,
          accepted_at = case when p_accept then now() else null end
      where id = p_link_id;
  elsif (p_accept and l.status = 'accepted') or (not p_accept and l.status = 'declined') then
    return;
  else
    raise exception 'This invitation is no longer pending';
  end if;
end;
$$;

-- Coach withdraws a pending invitation. Does not need an active plan, so an expired coach can tidy up.
create or replace function public.cancel_invite(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l coach_client_links;
begin
  select * into l from coach_client_links
    where id = p_link_id and coach_id = auth.uid() for update;
  if not found then raise exception 'Invite not found'; end if;

  if l.status = 'cancelled' then return; end if;
  if l.status <> 'pending' then raise exception 'Only a pending invitation can be cancelled'; end if;

  update coach_client_links set status = 'cancelled' where id = p_link_id;
end;
$$;

-- Either party ends an accepted relationship. No coach plan required, so an expired relationship
-- can still be ended. Repeat calls (by either party) are no-ops and keep the first end record.
create or replace function public.end_relationship(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l coach_client_links;
begin
  select * into l from coach_client_links
    where id = p_link_id and (coach_id = auth.uid() or client_id = auth.uid()) for update;
  if not found then raise exception 'Relationship not found'; end if;

  if l.status = 'ended' then return; end if;
  if l.status <> 'accepted' then raise exception 'Only an accepted relationship can be ended'; end if;

  update coach_client_links
    set status = 'ended', ended_at = now(), ended_by = auth.uid()
    where id = p_link_id;
end;
$$;

revoke all on function public.cancel_invite(uuid), public.end_relationship(uuid) from public, anon;
grant execute on function public.cancel_invite(uuid), public.end_relationship(uuid) to authenticated;
