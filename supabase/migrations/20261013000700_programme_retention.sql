-- Delivered programmes must not disappear.
--
-- Before this migration a coach could delete a programme after sending it (programs_delete_coach),
-- and deleting a coach profile cascaded to every programme they ever sent. Until M2 defines durable
-- assignment ownership and archiving, the rule is:
--
--   * drafts can be deleted by their coach;
--   * a 'sent' programme can not be deleted at all, directly or through a cascade from a profile or
--     auth-user deletion (so a coach with delivered programmes can't be deleted yet).
--
-- The only way around it is for a human operator on a direct database connection:
--   begin;
--   select set_config('app.allow_delivered_programme_delete', 'on', true);
--   delete from programs where ...;
--   commit;
-- That needs session_user = 'postgres' AND the transaction-local setting. API requests connect as
-- 'authenticator' and the auth service as 'supabase_auth_admin', so neither can use it, including
-- when the delete is a cascade (foreign-key actions run as the table owner, but session_user does
-- not change). Test fixtures clean up the same way.

create or replace function public.block_delivered_programme_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'sent'
     and not (
       session_user = 'postgres'
       and coalesce(current_setting('app.allow_delivered_programme_delete', true), '') = 'on'
     )
  then
    raise exception 'A programme that has been sent can not be deleted'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

revoke all on function public.block_delivered_programme_delete() from public, anon, authenticated;

create trigger block_delivered_programme_delete
  before delete on public.programs
  for each row execute function public.block_delivered_programme_delete();

drop policy "programs_delete_coach" on public.programs;
create policy "programs_delete_coach" on public.programs
  for delete to authenticated
  using (coach_id = auth.uid() and status = 'draft');

-- Sending a programme: lock the programme row before checking it, so two concurrent sends to two
-- different clients are serialised (the second one then sees 'sent' to someone else and fails), and
-- hold a share lock on the accepted link so it can't be ended between the check and the update.
create or replace function public.send_program(p_program uuid, p_client_id uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  prog programs;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;

  select * into prog from programs where id = p_program and coach_id = auth.uid() for update;
  if not found then raise exception 'Program not found'; end if;

  perform 1 from coach_client_links
    where coach_id = auth.uid() and client_id = p_client_id and status = 'accepted'
    for share;
  if not found then
    raise exception 'That client hasn''t accepted your invite';
  end if;

  if prog.status = 'sent' and prog.client_id is distinct from p_client_id then
    raise exception 'This program was already sent to someone else. Duplicate it to send it to another client.';
  end if;
  if not exists (
    select 1 from program_exercises e join program_days d on d.id = e.day_id
    where d.program_id = p_program
  ) then
    raise exception 'Add at least one exercise first';
  end if;

  update programs
    set client_id = p_client_id, status = 'sent', message = nullif(trim(coalesce(p_message, '')), ''),
        sent_at = now(), updated_at = now()
    where id = p_program;
end;
$$;
