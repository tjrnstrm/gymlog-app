-- Residual cleanup of the retired invite-by-email / role model.
--
-- A fresh install (baseline) has none of this, so every statement is a no-op there. It exists for
-- databases that went through the historical scripts and may still carry leftovers.
--
-- Data is never dropped here. If the old data structures still exist, this migration stops and asks
-- for an explicit archive/conversion first: the old role column does not map to coach subscriptions
-- or admin rights, and unresolved email invitations cannot be converted automatically.

do $$
declare
  leftovers text[] := '{}';
begin
  if to_regclass('public.coach_invites') is not null then
    leftovers := leftovers || 'table coach_invites';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coach_client_links'
      and column_name in ('client_email', 'invite_token')
  ) then
    leftovers := leftovers || 'coach_client_links.client_email / invite_token';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    leftovers := leftovers || 'profiles.role';
  end if;

  if cardinality(leftovers) > 0 then
    raise exception
      'Legacy invitation/role structures still exist (%). Archive them and define the conversion (for example which roles become coach subscriptions) before running this migration.',
      array_to_string(leftovers, ', ');
  end if;
end;
$$;

-- Functions and policies of the old model hold no data.
drop function if exists public.accept_coach_invite(uuid);
drop function if exists public.get_pending_invite(uuid);
drop function if exists public.get_pending_coach_invite(uuid);
drop function if exists public.accept_coach_invite_signup(uuid);

drop policy if exists "coach_client_links_all_as_coach" on public.coach_client_links;
drop policy if exists "coach_client_links_select_as_client" on public.coach_client_links;
