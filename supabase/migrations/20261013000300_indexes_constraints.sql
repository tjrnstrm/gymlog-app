-- Supporting indexes for foreign keys and RLS joins, status/value constraints, and the
-- "one pending admin invitation per invitee" invariant.
--
-- Existing coverage that is deliberately NOT duplicated:
--   * primary keys on every table (profiles.id, coach_subscriptions.user_id, ...)
--   * coach_client_links_pair_key (coach_id, client_id) already serves lookups by coach_id
--   * profiles_username_key
--
-- The constraints below are added validated: if existing rows violate them the migration fails,
-- which is intended (fix the data explicitly rather than hide it).

-- ---- indexes --------------------------------------------------------------------------------
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- History lists are "my workouts, newest first".
create index if not exists workouts_user_id_date_idx on public.workouts (user_id, date desc);

create index if not exists workout_exercises_workout_id_idx on public.workout_exercises (workout_id);
create index if not exists workout_exercises_exercise_id_idx on public.workout_exercises (exercise_id);
create index if not exists sets_workout_exercise_id_idx on public.sets (workout_exercise_id);

create index if not exists exercises_base_exercise_id_idx on public.exercises (base_exercise_id)
  where base_exercise_id is not null;

create index if not exists coach_client_links_client_id_idx on public.coach_client_links (client_id);

create index if not exists admin_invites_invited_user_id_idx on public.admin_invites (invited_user_id);
create index if not exists admin_invites_invited_by_idx on public.admin_invites (invited_by);
create index if not exists coach_subscriptions_granted_by_idx on public.coach_subscriptions (granted_by);

create index if not exists programs_coach_id_idx on public.programs (coach_id);
create index if not exists programs_client_id_idx on public.programs (client_id);
create index if not exists program_days_program_id_position_idx on public.program_days (program_id, position);
create index if not exists program_exercises_day_id_position_idx on public.program_exercises (day_id, position);

-- ---- one pending admin invitation per invitee ------------------------------------------------
-- admin_invite_admin() checks first, but two concurrent calls could both pass the check.
create unique index if not exists admin_invites_one_pending_per_user
  on public.admin_invites (invited_user_id) where status = 'pending';

-- ---- status and value constraints ------------------------------------------------------------
alter table public.coach_client_links
  add constraint coach_client_links_status_check check (status in ('pending', 'accepted', 'declined'));
alter table public.programs
  add constraint programs_status_check check (status in ('draft', 'sent'));
alter table public.admin_invites
  add constraint admin_invites_status_check check (status in ('pending', 'accepted', 'declined'));
alter table public.coach_subscriptions
  add constraint coach_subscriptions_source_check check (source in ('granted', 'paid'));

alter table public.sets
  add constraint sets_reps_nonnegative check (reps >= 0),
  add constraint sets_weight_nonnegative check (weight >= 0);
