// Fixtures for the database tests.
//
// * Users are created with the service-role admin API (fixture setup only) and then act through
//   ordinary signed-in clients, exactly like the app does. The tests under test never use the
//   service role.
// * Everything is unique per run (random suffix), so a failed run never collides with the next.
// * Cleanup goes through a direct local Postgres connection, which is also the only place allowed
//   to delete delivered programmes (session_user = postgres plus a transaction-local setting).
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { Database } from '@bro-split/database';

export type Client = SupabaseClient<Database>;
export type Sql = ReturnType<typeof postgres>;

const env = () => inject('env');

export const runId = randomBytes(3).toString('hex');
const PASSWORD = 'Test-passw0rd!';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function makeSql(): Sql {
  return postgres(env().dbUrl, { max: 6, onnotice: () => {}, prepare: false });
}

/** Service-role client: fixture setup (creating auth users) only. */
export function adminApi(): Client {
  return createClient<Database>(env().apiUrl, env().serviceKey, noSession);
}

/** A client with no session. */
export function anonClient(): Client {
  return createClient<Database>(env().apiUrl, env().anonKey, noSession);
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  /** Signed in as this user. */
  client: Client;
}

const created: string[] = [];

export async function createUser(label: string): Promise<TestUser> {
  const username = `t${runId}_${label}`.toLowerCase().slice(0, 20);
  const email = `${username}@bro-split.test`;
  const admin = adminApi();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
  created.push(data.user.id);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`sign in (${label}) failed: ${signInError.message}`);
  return { id: data.user.id, email, username, client };
}

/** Removes the fixture users (and everything that cascades from them), including sent programmes. */
export async function cleanup(sql: Sql, extraUserIds: string[] = []): Promise<void> {
  const ids = [...created, ...extraUserIds];
  if (ids.length > 0) {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.allow_delivered_programme_delete', 'on', true)`;
      await tx`delete from public.programs where coach_id = any(${ids}::uuid[]) or client_id = any(${ids}::uuid[])`;
    });
    const admin = adminApi();
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
  await sql`delete from public.exercises where is_global and name like ${`T${runId}%`}`;
  created.length = 0;
}

/* ---------------------------- database-side setup (direct connection) ---------------------------- */

export async function grantCoachPlan(sql: Sql, userId: string, opts: { expired?: boolean } = {}): Promise<void> {
  await sql`
    insert into public.coach_subscriptions (user_id, source, expires_at)
    values (${userId}, 'granted', ${opts.expired ? sql`now() - interval '1 day'` : null})
    on conflict (user_id) do update set expires_at = excluded.expires_at`;
}

export async function revokeCoachPlan(sql: Sql, userId: string): Promise<void> {
  await sql`delete from public.coach_subscriptions where user_id = ${userId}`;
}

export async function makeAdmin(sql: Sql, userId: string): Promise<void> {
  await sql`update public.profiles set is_admin = true where id = ${userId}`;
}

export type LinkStatus = 'pending' | 'accepted' | 'declined' | 'ended' | 'cancelled';

/** Inserts (or replaces) a coach/client link in the given state, bypassing the invite functions. */
export async function setLink(sql: Sql, coachId: string, clientId: string, status: LinkStatus): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.coach_client_links (coach_id, client_id, status, accepted_at, ended_at, ended_by)
    values (
      ${coachId}, ${clientId}, ${status},
      ${status === 'accepted' || status === 'ended' ? sql`now()` : null},
      ${status === 'ended' ? sql`now()` : null},
      ${status === 'ended' ? clientId : null}
    )
    on conflict (coach_id, client_id) do update
      set status = excluded.status, accepted_at = excluded.accepted_at,
          ended_at = excluded.ended_at, ended_by = excluded.ended_by
    returning id`;
  return row.id;
}

export interface SeededTraining {
  workoutId: string;
  exerciseId: string;
  workoutExerciseId: string;
  setId: string;
}

/** One workout with one exercise and one set, owned by `ownerId`. */
export async function seedTraining(
  sql: Sql,
  ownerId: string,
  opts: { weight?: number; reps?: number; exerciseId?: string; exerciseName?: string; workoutName?: string } = {},
): Promise<SeededTraining> {
  const name = opts.exerciseName ?? `T${runId} private ${randomBytes(2).toString('hex')}`;
  let exerciseId = opts.exerciseId;
  if (!exerciseId) {
    const [e] = await sql<{ id: string }[]>`
      insert into public.exercises (name, owner_id, is_global) values (${name}, ${ownerId}, false) returning id`;
    exerciseId = e.id;
  }
  const [w] = await sql<{ id: string }[]>`
    insert into public.workouts (user_id, name, date)
    values (${ownerId}, ${opts.workoutName ?? 'Test workout'}, now()) returning id`;
  const [we] = await sql<{ id: string }[]>`
    insert into public.workout_exercises (workout_id, exercise_id, exercise_name)
    values (${w.id}, ${exerciseId}, ${name}) returning id`;
  const [s] = await sql<{ id: string }[]>`
    insert into public.sets (workout_exercise_id, reps, weight)
    values (${we.id}, ${opts.reps ?? 5}, ${opts.weight ?? 100}) returning id`;
  return { workoutId: w.id, exerciseId, workoutExerciseId: we.id, setId: s.id };
}

export async function seedGlobalExercise(sql: Sql, label = 'global'): Promise<string> {
  const [e] = await sql<{ id: string }[]>`
    insert into public.exercises (name, owner_id, is_global)
    values (${`T${runId} ${label} ${randomBytes(2).toString('hex')}`}, null, true) returning id`;
  return e.id;
}
