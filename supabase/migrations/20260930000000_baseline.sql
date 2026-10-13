-- Baseline for FRESH installations of the Bro Split database (Supabase Postgres 17).
--
-- This consolidates the final state of Drizzle migrations 0000-0004 and of rls.sql, storage.sql
-- and platform.sql into one file. It deliberately omits the statements that only cleaned up the
-- old invitation/role model (they are no-ops on an empty database), and it must NEVER be replayed
-- over an existing database: use the forward migrations that follow it instead.
--
-- Equivalence with the historical process is verified by db/tools/schema-snapshot.ts
-- (a database upgraded through the old scripts, compared object by object with this baseline).
-- See docs/migrations.md.

-- ---------------------------------------------------------------------------
-- 1. Tables, constraints and indexes (final state of Drizzle migrations 0000-0004)
-- ---------------------------------------------------------------------------
-- Constraint and index names are kept identical to the Drizzle-generated ones so that existing
-- databases and this baseline can be compared object by object.

create table "exercises" (
	"id" uuid primary key default gen_random_uuid() not null,
	"name" text not null,
	"muscle_groups" text[] default '{}' not null,
	"category" text[] default '{}' not null,
	"brand" text,
	"base_exercise_id" uuid,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);

create table "profiles" (
	"id" uuid primary key not null,
	"name" text,
	"age" integer,
	"avatar_url" text,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	"username" text,
	"bio" text,
	"coach_tags" text[] default '{}' not null,
	"is_admin" boolean default false not null
);

create table "push_subscriptions" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid default auth.uid() not null,
	"subscription" jsonb not null,
	"created_at" timestamp with time zone default now() not null
);

create table "workouts" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid default auth.uid() not null,
	"name" text not null,
	"gym" text,
	"date" timestamp with time zone not null,
	"notes" text,
	"rating" integer,
	"is_template" boolean default false not null,
	"duration_seconds" integer,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);

create table "workout_exercises" (
	"id" uuid primary key default gen_random_uuid() not null,
	"workout_id" uuid not null,
	"exercise_id" uuid not null,
	"exercise_name" text not null,
	"created_at" timestamp with time zone default now() not null
);

create table "sets" (
	"id" uuid primary key default gen_random_uuid() not null,
	"workout_exercise_id" uuid not null,
	"reps" integer not null,
	"weight" double precision not null,
	"created_at" timestamp with time zone default now() not null
);

create table "coach_client_links" (
	"id" uuid primary key default gen_random_uuid() not null,
	"coach_id" uuid not null,
	"client_id" uuid not null,
	"status" text default 'pending' not null,
	"created_at" timestamp with time zone default now() not null,
	"accepted_at" timestamp with time zone
);

create table "admin_invites" (
	"id" uuid primary key default gen_random_uuid() not null,
	"invited_user_id" uuid not null,
	"invited_by" uuid,
	"status" text default 'pending' not null,
	"created_at" timestamp with time zone default now() not null
);

create table "coach_access_requests" (
	"user_id" uuid primary key not null,
	"created_at" timestamp with time zone default now() not null
);

create table "coach_subscriptions" (
	"user_id" uuid primary key not null,
	"source" text not null,
	"granted_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null
);

create table "programs" (
	"id" uuid primary key default gen_random_uuid() not null,
	"coach_id" uuid not null,
	"client_id" uuid,
	"name" text not null,
	"status" text default 'draft' not null,
	"message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);

create table "program_days" (
	"id" uuid primary key default gen_random_uuid() not null,
	"program_id" uuid not null,
	"name" text not null,
	"position" integer not null
);

create table "program_exercises" (
	"id" uuid primary key default gen_random_uuid() not null,
	"day_id" uuid not null,
	"position" integer not null,
	"name" text not null,
	"sets" integer,
	"reps" text,
	"rest" text,
	"feeder" text,
	"comment" text,
	"link" text
);

alter table "exercises" add constraint "exercises_base_exercise_id_exercises_id_fk" foreign key ("base_exercise_id") references "public"."exercises"("id") on delete set null on update no action;
alter table "profiles" add constraint "profiles_id_users_id_fk" foreign key ("id") references "auth"."users"("id") on delete cascade on update no action;
alter table "push_subscriptions" add constraint "push_subscriptions_user_id_profiles_id_fk" foreign key ("user_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "workouts" add constraint "workouts_user_id_profiles_id_fk" foreign key ("user_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "workout_exercises" add constraint "workout_exercises_workout_id_workouts_id_fk" foreign key ("workout_id") references "public"."workouts"("id") on delete cascade on update no action;
alter table "workout_exercises" add constraint "workout_exercises_exercise_id_exercises_id_fk" foreign key ("exercise_id") references "public"."exercises"("id") on delete restrict on update no action;
alter table "sets" add constraint "sets_workout_exercise_id_workout_exercises_id_fk" foreign key ("workout_exercise_id") references "public"."workout_exercises"("id") on delete cascade on update no action;
alter table "coach_client_links" add constraint "coach_client_links_coach_id_profiles_id_fk" foreign key ("coach_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "coach_client_links" add constraint "coach_client_links_client_id_profiles_id_fk" foreign key ("client_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "coach_client_links" add constraint "coach_client_links_pair_key" unique ("coach_id", "client_id");
alter table "admin_invites" add constraint "admin_invites_invited_user_id_profiles_id_fk" foreign key ("invited_user_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "admin_invites" add constraint "admin_invites_invited_by_profiles_id_fk" foreign key ("invited_by") references "public"."profiles"("id") on delete set null on update no action;
alter table "coach_access_requests" add constraint "coach_access_requests_user_id_profiles_id_fk" foreign key ("user_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "coach_subscriptions" add constraint "coach_subscriptions_user_id_profiles_id_fk" foreign key ("user_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "coach_subscriptions" add constraint "coach_subscriptions_granted_by_profiles_id_fk" foreign key ("granted_by") references "public"."profiles"("id") on delete set null on update no action;
alter table "programs" add constraint "programs_coach_id_profiles_id_fk" foreign key ("coach_id") references "public"."profiles"("id") on delete cascade on update no action;
alter table "programs" add constraint "programs_client_id_profiles_id_fk" foreign key ("client_id") references "public"."profiles"("id") on delete set null on update no action;
alter table "program_days" add constraint "program_days_program_id_programs_id_fk" foreign key ("program_id") references "public"."programs"("id") on delete cascade on update no action;
alter table "program_exercises" add constraint "program_exercises_day_id_program_days_id_fk" foreign key ("day_id") references "public"."program_days"("id") on delete cascade on update no action;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security for the core training tables (was rls.sql)
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table sets enable row level security;
alter table push_subscriptions enable row level security;

-- profiles: a user can only see/edit their own row.
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- exercises: shared catalog. Any authenticated user can read and contribute,
-- matching today's app behavior (nothing currently gates who can add/edit one).
create policy "exercises_select_authenticated" on exercises
  for select using (auth.role() = 'authenticated');
create policy "exercises_insert_authenticated" on exercises
  for insert with check (auth.role() = 'authenticated');
create policy "exercises_update_authenticated" on exercises
  for update using (auth.role() = 'authenticated');
create policy "exercises_delete_authenticated" on exercises
  for delete using (auth.role() = 'authenticated');

-- workouts: owner-only CRUD.
create policy "workouts_all_own" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- workout_exercises: owner-only, via the parent workout's owner.
create policy "workout_exercises_all_own" on workout_exercises
  for all using (
    exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- sets: owner-only, via the workout_exercise -> workout chain.
create policy "sets_all_own" on sets
  for all using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = workout_exercise_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = workout_exercise_id and w.user_id = auth.uid()
    )
  );

-- push_subscriptions: owner-only.
create policy "push_subscriptions_all_own" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Avatar storage (was storage.sql)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatar_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 4. Platform security model (was platform.sql, sections 1-8)
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 1. Usernames: lowercase handle without the '@', unique
-- ---------------------------------------------------------------------------
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._]{3,20}$');
create unique index if not exists profiles_username_key on profiles (username);

-- ---------------------------------------------------------------------------
-- 2. Column privileges: a user may only edit safe profile fields directly.
--    (Without this, the update-own-row policy would let anyone set is_admin.)
-- ---------------------------------------------------------------------------
revoke update on profiles from authenticated, anon;
revoke insert, delete on profiles from authenticated, anon;
grant update (name, age, avatar_url, bio, coach_tags) on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function is_admin(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = p_uid), false);
$$;

create or replace function has_coach_access(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coach_subscriptions
    where user_id = p_uid and (expires_at is null or expires_at > now())
  );
$$;

create or replace function my_access()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'coach', has_coach_access(auth.uid()),
    'requested', exists (select 1 from coach_access_requests where user_id = auth.uid()),
    'admin_invite', exists (select 1 from admin_invites where invited_user_id = auth.uid() and status = 'pending')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Signup: the username travels in the signup metadata
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u text := lower(nullif(trim(new.raw_user_meta_data->>'username'), ''));
begin
  if u is not null and u !~ '^[a-z0-9._]{3,20}$' then u := null; end if;
  insert into public.profiles (id, username) values (new.id, u);
  return new;
exception when unique_violation then
  -- Someone took the username between the availability check and signup. The account is
  -- still created; the app asks for a new username on first load.
  insert into public.profiles (id, username) values (new.id, null);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

create or replace function set_username(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  u text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if u !~ '^[a-z0-9._]{3,20}$' then
    raise exception 'Usernames are 3–20 characters: letters, numbers, . or _';
  end if;
  update profiles set username = u where id = auth.uid() and username is null;
  if not found then raise exception 'Username already set'; end if;
exception when unique_violation then
  raise exception 'That username is taken';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Coach <-> client links. No direct inserts/updates: everything goes through
--    invite_client / respond_to_invite so the paywall and consent are enforced.
-- ---------------------------------------------------------------------------
alter table coach_client_links enable row level security;


create policy "links_select_as_coach" on coach_client_links
  for select using (auth.uid() = coach_id);
create policy "links_select_as_client" on coach_client_links
  for select using (auth.uid() = client_id);
create policy "links_delete_as_either" on coach_client_links
  for delete using (auth.uid() = coach_id or auth.uid() = client_id);

-- A coach's read access into an accepted client's data now also requires an active coach plan.

create policy "profiles_select_as_coach" on profiles
  for select using (
    has_coach_access(auth.uid()) and exists (
      select 1 from coach_client_links l
      where l.client_id = profiles.id and l.coach_id = auth.uid() and l.status = 'accepted'
    )
  );
create policy "workouts_select_as_coach" on workouts
  for select using (
    has_coach_access(auth.uid()) and exists (
      select 1 from coach_client_links l
      where l.client_id = workouts.user_id and l.coach_id = auth.uid() and l.status = 'accepted'
    )
  );
create policy "workout_exercises_select_as_coach" on workout_exercises
  for select using (
    has_coach_access(auth.uid()) and exists (
      select 1 from workouts w
      join coach_client_links l on l.client_id = w.user_id
      where w.id = workout_id and l.coach_id = auth.uid() and l.status = 'accepted'
    )
  );
create policy "sets_select_as_coach" on sets
  for select using (
    has_coach_access(auth.uid()) and exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      join coach_client_links l on l.client_id = w.user_id
      where we.id = workout_exercise_id and l.coach_id = auth.uid() and l.status = 'accepted'
    )
  );

-- A client can read the profile of a coach they're linked to (for the client dashboard).
create policy "profiles_select_coach_as_client" on profiles
  for select using (
    exists (
      select 1 from coach_client_links l
      where l.coach_id = profiles.id and l.client_id = auth.uid() and l.status = 'accepted'
    )
  );

create or replace function invite_client(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;
  select id into target from profiles
    where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username'; end if;
  if target = auth.uid() then raise exception 'You can''t invite yourself'; end if;
  if exists (
    select 1 from coach_client_links
    where coach_id = auth.uid() and client_id = target and status in ('pending', 'accepted')
  ) then
    raise exception 'You''ve already invited this user';
  end if;
  insert into coach_client_links (coach_id, client_id) values (auth.uid(), target)
  on conflict (coach_id, client_id)
  do update set status = 'pending', created_at = now(), accepted_at = null;
end;
$$;

create or replace function respond_to_invite(p_link_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_client_links
    set status = case when p_accept then 'accepted' else 'declined' end,
        accepted_at = case when p_accept then now() else null end
    where id = p_link_id and client_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Invite not found'; end if;
end;
$$;

create or replace function my_clients()
returns table (id uuid, client_id uuid, username text, name text, status text, created_at timestamptz, accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.client_id, p.username, p.name, l.status, l.created_at, l.accepted_at
  from coach_client_links l
  join profiles p on p.id = l.client_id
  where l.coach_id = auth.uid()
  order by l.created_at desc;
$$;

create or replace function my_coaches()
returns table (id uuid, coach_id uuid, username text, name text, bio text, coach_tags text[], status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.coach_id, p.username, p.name, p.bio, p.coach_tags, l.status, l.created_at
  from coach_client_links l
  join profiles p on p.id = l.coach_id
  where l.client_id = auth.uid() and l.status in ('pending', 'accepted')
  order by l.created_at desc;
$$;

-- The public coach directory: coaches with an active plan and a username.
create or replace function list_coaches()
returns table (id uuid, username text, name text, bio text, coach_tags text[], avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.bio, p.coach_tags, p.avatar_url
  from profiles p
  where p.username is not null and p.id <> auth.uid() and has_coach_access(p.id)
  order by p.name nulls last, p.username
  limit 200;
$$;

create or replace function request_coach_access()
returns void language sql security definer set search_path = public as $$
  insert into coach_access_requests (user_id) values (auth.uid()) on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- 6. Programs: RLS for reads, functions for writes (so the paywall applies)
-- ---------------------------------------------------------------------------
alter table programs enable row level security;
alter table program_days enable row level security;
alter table program_exercises enable row level security;
alter table coach_subscriptions enable row level security;
alter table coach_access_requests enable row level security;
alter table admin_invites enable row level security;
-- The last three have no policies on purpose: reachable only through the functions here.

create policy "programs_select_coach" on programs for select using (coach_id = auth.uid());
create policy "programs_select_client" on programs for select
  using (client_id = auth.uid() and status = 'sent');
create policy "programs_delete_coach" on programs for delete using (coach_id = auth.uid());

create policy "program_days_select" on program_days for select using (
  exists (
    select 1 from programs p where p.id = program_id
      and (p.coach_id = auth.uid() or (p.client_id = auth.uid() and p.status = 'sent'))
  )
);

create policy "program_exercises_select" on program_exercises for select using (
  exists (
    select 1 from program_days d join programs p on p.id = d.program_id
    where d.id = day_id
      and (p.coach_id = auth.uid() or (p.client_id = auth.uid() and p.status = 'sent'))
  )
);

-- Save (create or replace) a whole program from JSON:
--   { id?, name, days: [ { name, exercises: [ { name, sets, reps, rest, feeder, comment, link } ] } ] }
create or replace function save_program(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  d jsonb;
  e jsonb;
  did uuid;
  di int := 0;
  ei int;
  pname text := trim(coalesce(p->>'name', ''));
  lnk text;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;
  if pname = '' then raise exception 'Give the program a name'; end if;

  if nullif(p->>'id', '') is not null then
    select id into pid from programs where id = (p->>'id')::uuid and coach_id = auth.uid();
    if pid is null then raise exception 'Program not found'; end if;
    update programs set name = pname, updated_at = now() where id = pid;
    delete from program_days where program_id = pid;
  else
    insert into programs (coach_id, name) values (auth.uid(), pname) returning id into pid;
  end if;

  for d in select value from jsonb_array_elements(coalesce(p->'days', '[]'::jsonb)) loop
    di := di + 1;
    ei := 0;
    insert into program_days (program_id, name, position)
    values (pid, coalesce(nullif(trim(d->>'name'), ''), 'Day ' || di), di)
    returning id into did;

    for e in select value from jsonb_array_elements(coalesce(d->'exercises', '[]'::jsonb)) loop
      if nullif(trim(e->>'name'), '') is null then continue; end if;
      lnk := nullif(trim(coalesce(e->>'link', '')), '');
      if lnk is not null and lnk !~* '^https?://' then
        raise exception 'Links must start with http:// or https://';
      end if;
      ei := ei + 1;
      insert into program_exercises (day_id, position, name, sets, reps, rest, feeder, comment, link)
      values (
        did, ei, trim(e->>'name'),
        case when (e->>'sets') ~ '^\d{1,3}$' then (e->>'sets')::int end,
        nullif(trim(coalesce(e->>'reps', '')), ''),
        nullif(trim(coalesce(e->>'rest', '')), ''),
        nullif(trim(coalesce(e->>'feeder', '')), ''),
        nullif(trim(coalesce(e->>'comment', '')), ''),
        lnk
      );
    end loop;
  end loop;

  return pid;
end;
$$;

create or replace function send_program(p_program uuid, p_client_id uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  prog programs;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;
  select * into prog from programs where id = p_program and coach_id = auth.uid();
  if not found then raise exception 'Program not found'; end if;
  if not exists (
    select 1 from coach_client_links
    where coach_id = auth.uid() and client_id = p_client_id and status = 'accepted'
  ) then
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

create or replace function duplicate_program(p_program uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  src programs;
  newp uuid;
  d record;
  newd uuid;
begin
  if not has_coach_access(auth.uid()) then raise exception 'Coach access required'; end if;
  select * into src from programs where id = p_program and coach_id = auth.uid();
  if not found then raise exception 'Program not found'; end if;
  insert into programs (coach_id, name) values (auth.uid(), src.name || ' (copy)') returning id into newp;
  for d in select * from program_days where program_id = p_program order by position loop
    insert into program_days (program_id, name, position) values (newp, d.name, d.position) returning id into newd;
    insert into program_exercises (day_id, position, name, sets, reps, rest, feeder, comment, link)
      select newd, position, name, sets, reps, rest, feeder, comment, link
      from program_exercises where day_id = d.id;
  end loop;
  return newp;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Admin area
-- ---------------------------------------------------------------------------
create or replace function admin_overview()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select json_build_object(
    'total', (select count(*) from profiles),
    'coaches', (select count(*) from coach_subscriptions where expires_at is null or expires_at > now()),
    'granted', (select count(*) from coach_subscriptions
                where source = 'granted' and (expires_at is null or expires_at > now())),
    'paid', (select count(*) from coach_subscriptions
             where source = 'paid' and (expires_at is null or expires_at > now())),
    'clients', (select count(distinct l.client_id) from coach_client_links l
                where l.status = 'accepted' and not has_coach_access(l.client_id))
  ) into result;
  return result;
end;
$$;

create or replace function admin_list_users(p_search text default '')
returns table (id uuid, username text, name text, is_admin boolean, coach_active boolean,
               coach_source text, requested boolean, is_client boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  return query
  select p.id, p.username, p.name, p.is_admin,
         has_coach_access(p.id),
         (select s.source from coach_subscriptions s where s.user_id = p.id),
         exists (select 1 from coach_access_requests r where r.user_id = p.id),
         exists (select 1 from coach_client_links l where l.client_id = p.id and l.status = 'accepted')
  from profiles p
  where coalesce(p_search, '') = ''
     or p.username ilike '%' || trim(both '@' from trim(p_search)) || '%'
     or p.name ilike '%' || trim(p_search) || '%'
  order by p.created_at desc
  limit 100;
end;
$$;

create or replace function admin_grant_coach(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select id into target from profiles where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username'; end if;
  if exists (
    select 1 from coach_subscriptions
    where user_id = target and source = 'paid' and (expires_at is null or expires_at > now())
  ) then
    raise exception 'This user already has a paid plan';
  end if;
  insert into coach_subscriptions (user_id, source, granted_by, expires_at)
  values (target, 'granted', auth.uid(), null)
  on conflict (user_id) do update
    set source = 'granted', granted_by = auth.uid(), expires_at = null;
  delete from coach_access_requests where user_id = target;
end;
$$;

create or replace function admin_revoke_coach(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select id into target from profiles where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username'; end if;
  delete from coach_subscriptions where user_id = target and source = 'granted';
  if not found then raise exception 'Only admin-granted access can be revoked'; end if;
end;
$$;

create or replace function admin_list_admins()
returns table (id uuid, username text, name text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  return query
  select p.id, p.username, p.name, 'admin'::text from profiles p where p.is_admin
  union all
  select p.id, p.username, p.name, 'pending'::text
  from admin_invites i join profiles p on p.id = i.invited_user_id where i.status = 'pending'
  order by 4, 2;
end;
$$;

create or replace function admin_invite_admin(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select id into target from profiles where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username. They need an account first.'; end if;
  if is_admin(target) then raise exception 'That user is already an admin'; end if;
  if exists (select 1 from admin_invites where invited_user_id = target and status = 'pending') then
    raise exception 'Already invited';
  end if;
  insert into admin_invites (invited_user_id, invited_by) values (target, auth.uid());
end;
$$;

create or replace function admin_cancel_admin_invite(p_username text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  delete from admin_invites
  where status = 'pending'
    and invited_user_id = (select id from profiles where username = lower(trim(both '@' from trim(p_username))));
end;
$$;

create or replace function admin_remove_admin(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select id into target from profiles where username = lower(trim(both '@' from trim(p_username)));
  if target is null then raise exception 'No user with that username'; end if;
  if target = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  update profiles set is_admin = false where id = target;
end;
$$;

create or replace function respond_admin_invite(p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update admin_invites
    set status = case when p_accept then 'accepted' else 'declined' end
    where invited_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'No pending admin invite'; end if;
  if p_accept then update profiles set is_admin = true where id = auth.uid(); end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Function privileges: signed-in users only (username_available is also public,
--    so the signup form can check a name before an account exists).
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'is_admin', 'has_coach_access', 'my_access', 'username_available', 'set_username',
      'invite_client', 'respond_to_invite', 'my_clients', 'my_coaches', 'list_coaches',
      'request_coach_access', 'save_program', 'send_program', 'duplicate_program',
      'admin_overview', 'admin_list_users', 'admin_grant_coach', 'admin_revoke_coach',
      'admin_list_admins', 'admin_invite_admin', 'admin_cancel_admin_invite',
      'admin_remove_admin', 'respond_admin_invite'
    ])
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    if f.proname = 'username_available' then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end;
$$;
