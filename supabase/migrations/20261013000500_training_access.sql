-- One rule for "may the caller read this user's training data".
--
--   * the owner always can;
--   * a coach can only while they hold an ACTIVE coach plan AND have an ACCEPTED link to the owner.
--
-- Admin status is deliberately not part of the rule: being an admin grants no access to anyone's
-- training data. An admin who is also an accepted, active coach (or the owner) has normal access.
--
-- Coach access is read-only: only the *_all_own policies grant writes.
--
-- The helper derives the caller from auth.uid() and never trusts a caller-supplied identity. It is
-- SECURITY DEFINER so it can read links/subscriptions without going through their RLS (no policy
-- recursion), has an empty search_path, and is only executable by signed-in users.

create or replace function public.can_read_training(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and p_owner is not null
     and (
       p_owner = auth.uid()
       or (
         public.has_coach_access(auth.uid())
         and exists (
           select 1 from public.coach_client_links l
           where l.coach_id = auth.uid() and l.client_id = p_owner and l.status = 'accepted'
         )
       )
     );
$$;

revoke all on function public.can_read_training(uuid) from public, anon;
grant execute on function public.can_read_training(uuid) to authenticated;

-- The four coach-read policies, rewritten on top of the helper. Restricted to signed-in users so an
-- anonymous request is refused up front instead of evaluating the helper.
drop policy "profiles_select_as_coach" on public.profiles;
create policy "profiles_select_as_coach" on public.profiles
  for select to authenticated
  using (public.can_read_training(id));

drop policy "workouts_select_as_coach" on public.workouts;
create policy "workouts_select_as_coach" on public.workouts
  for select to authenticated
  using (public.can_read_training(user_id));

drop policy "workout_exercises_select_as_coach" on public.workout_exercises;
create policy "workout_exercises_select_as_coach" on public.workout_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and public.can_read_training(w.user_id)
    )
  );

drop policy "sets_select_as_coach" on public.sets;
create policy "sets_select_as_coach" on public.sets
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and public.can_read_training(w.user_id)
    )
  );
