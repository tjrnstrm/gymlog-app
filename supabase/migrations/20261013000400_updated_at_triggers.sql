-- `default now()` only stamps a row when it is created. Without a trigger, updated_at never moves
-- and cannot be used as a modification time (or later as a sync cursor).
--
-- Contract after this migration: on every UPDATE that changes a row, updated_at is set to the
-- transaction time by the database. A client-supplied updated_at value is ignored.
-- Tables without an updated_at column (sets, workout_exercises, links, ...) have no such contract.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new is distinct from old then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
