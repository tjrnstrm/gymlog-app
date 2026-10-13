-- Privilege hardening. On Supabase every table and function created by `postgres` in `public` is
-- granted to anon/authenticated/service_role by default, so Row Level Security is the only thing
-- protecting a table, and every public table must have it enabled (tested).
--
--   * anon (signed-out) needs no table access at all: the only anonymous entry points are the
--     username_available() function and the public avatars bucket (storage schema);
--   * nobody coming through the API needs TRUNCATE, REFERENCES or TRIGGER, and RLS does not apply
--     to TRUNCATE;
--   * handle_new_user() is a trigger function and must not be callable through the API;
--   * tables that are only ever written through security-definer functions carry no write grants
--     for signed-in users, so a direct write fails loudly instead of silently matching no policy.

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Written only by invite_client / respond_to_invite / cancel_invite / end_relationship.
revoke insert, update, delete on public.coach_client_links from authenticated;

-- Programmes are written by save_program / send_program / duplicate_program. The one direct write
-- left is deleting a DRAFT programme (policy programs_delete_coach), so delete stays on programs.
revoke insert, update on public.programs from authenticated;
revoke insert, update, delete on public.program_days, public.program_exercises from authenticated;

-- No policies at all: reachable only through the functions (my_access, admin_*, ...).
revoke all on public.admin_invites, public.coach_access_requests, public.coach_subscriptions from authenticated;

-- Objects created later by `postgres` in this schema are not exposed to anon unless a migration
-- grants it explicitly. (authenticated keeps its default grants; RLS must be enabled on new tables.)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
