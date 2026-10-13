-- Exercise ownership: a global catalogue (managed by admins) plus private entries.
--
-- Before this migration every signed-in user could read, edit and delete every exercise row.
--
--   global  (is_global = true,  owner_id is null)  readable by everyone signed in, changed by admins
--   private (is_global = false, owner_id = owner)  changed only by the owner
--
-- Read access:   global rows, your own rows, and exercises used in a workout you may read
--                (a coach sees the exercise metadata behind a client's workouts, nothing more).
-- Insert:        private rows owned by the caller only. Global rows come from
--                admin_create_global_exercise().
-- Update/delete: owner for private rows, admin for global rows. owner_id and is_global can never be
--                changed through the API (column privileges), and inserts are pinned by the policy.
--
-- Two integrity rules a foreign key alone can't express are enforced with triggers:
--   * base_exercise_id must be a global exercise or one of the same owner's;
--   * workout_exercises may only reference a global exercise or one owned by the workout's owner,
--     so read access as a coach never lets someone attach a client's private exercise to their own.

-- Existing rows have no owner. Never guess one, and never make historical entries global by default.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.exercises;
  if n > 0 then
    raise exception
      '% exercise row(s) exist and have no owner. Classify them explicitly (for example by importing them as private entries of a named user, or deleting them) before applying this migration.', n;
  end if;
end;
$$;

alter table public.exercises
  add column owner_id uuid default auth.uid() references public.profiles (id) on delete cascade,
  add column is_global boolean not null default false,
  add constraint exercises_ownership_check
    check ((is_global and owner_id is null) or (not is_global and owner_id is not null));

create index exercises_owner_id_idx on public.exercises (owner_id) where owner_id is not null;

-- The exercise reference of a logged exercise was ON DELETE RESTRICT, which fails immediately. Now
-- that exercises can belong to a user, deleting that user cascades to both their workouts and their
-- private exercises, and the order of those two cascades must not decide whether it works. NO ACTION
-- plus DEFERRABLE INITIALLY DEFERRED checks the reference at commit, when all cascades are done.
-- Deleting an exercise that is still used by a workout still fails (at commit).
alter table public.workout_exercises drop constraint workout_exercises_exercise_id_exercises_id_fk;
alter table public.workout_exercises
  add constraint workout_exercises_exercise_id_exercises_id_fk
    foreign key (exercise_id) references public.exercises (id)
    on delete no action on update no action
    deferrable initially deferred;

-- ---- helper: exercise is used in a workout the caller may read ---------------------------------
create or replace function public.exercise_visible_via_training(p_exercise uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.workout_exercises we
       join public.workouts w on w.id = we.workout_id
       where we.exercise_id = p_exercise and public.can_read_training(w.user_id)
     );
$$;

revoke all on function public.exercise_visible_via_training(uuid) from public, anon;
grant execute on function public.exercise_visible_via_training(uuid) to authenticated;

-- ---- policies ----------------------------------------------------------------------------------
drop policy "exercises_select_authenticated" on public.exercises;
drop policy "exercises_insert_authenticated" on public.exercises;
drop policy "exercises_update_authenticated" on public.exercises;
drop policy "exercises_delete_authenticated" on public.exercises;

create policy "exercises_select" on public.exercises
  for select to authenticated
  using (is_global or owner_id = auth.uid() or public.exercise_visible_via_training(id));

create policy "exercises_insert_private" on public.exercises
  for insert to authenticated
  with check (not is_global and owner_id = auth.uid());

create policy "exercises_update" on public.exercises
  for update to authenticated
  using ((not is_global and owner_id = auth.uid()) or (is_global and public.is_admin(auth.uid())))
  with check ((not is_global and owner_id = auth.uid()) or (is_global and public.is_admin(auth.uid())));

create policy "exercises_delete" on public.exercises
  for delete to authenticated
  using ((not is_global and owner_id = auth.uid()) or (is_global and public.is_admin(auth.uid())));

-- Only the descriptive columns may be edited directly.
revoke update on public.exercises from authenticated, anon;
grant update (name, muscle_groups, category, brand, base_exercise_id) on public.exercises to authenticated;

-- ---- creating global entries -------------------------------------------------------------------
create or replace function public.admin_create_global_exercise(
  p_name text,
  p_muscle_groups text[] default '{}',
  p_category text[] default '{}',
  p_brand text default null,
  p_base_exercise_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Give the exercise a name'; end if;

  insert into public.exercises (name, muscle_groups, category, brand, base_exercise_id, owner_id, is_global)
  values (trim(p_name), coalesce(p_muscle_groups, '{}'), coalesce(p_category, '{}'),
          nullif(trim(coalesce(p_brand, '')), ''), p_base_exercise_id, null, true)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.admin_create_global_exercise(text, text[], text[], text, uuid) from public, anon;
grant execute on function public.admin_create_global_exercise(text, text[], text[], text, uuid) to authenticated;

-- ---- integrity triggers ------------------------------------------------------------------------
create or replace function public.check_exercise_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base_exercise_id is not null and not exists (
    select 1 from public.exercises b
    where b.id = new.base_exercise_id
      and (b.is_global or (new.owner_id is not null and b.owner_id = new.owner_id))
  ) then
    raise exception 'The base exercise must be a global exercise or one of your own'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_exercise_base() from public, anon, authenticated;

create trigger check_exercise_base
  before insert or update of base_exercise_id, owner_id on public.exercises
  for each row execute function public.check_exercise_base();

create or replace function public.check_workout_exercise_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workouts w
    join public.exercises e on e.id = new.exercise_id
    where w.id = new.workout_id and (e.is_global or e.owner_id = w.user_id)
  ) then
    raise exception 'That exercise is not available in this workout'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_workout_exercise_owner() from public, anon, authenticated;

create trigger check_workout_exercise_owner
  before insert or update of exercise_id, workout_id on public.workout_exercises
  for each row execute function public.check_workout_exercise_owner();
