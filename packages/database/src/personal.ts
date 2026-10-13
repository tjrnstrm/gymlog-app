// Queries about the signed-in user's OWN data.
//
// A coach can read their accepted clients' workouts (Row Level Security allows it), so an
// unfiltered `from('workouts').select()` returns the coach's own AND their clients' rows. Anything
// that means "my history", "my records" or "my exercises" must go through these functions, which
// always filter by the session's own user id. Reading a client's data is a separate, explicit
// operation: see coach.ts.
import type { QueryData } from '@supabase/supabase-js';
import type { BroSplitClient, TableRow } from './client.ts';
import { requireUserId } from './client.ts';

const WORKOUT_SELECT = '*, exercises:workout_exercises(*, sets(*))' as const;

const workoutsQuery = (client: BroSplitClient) => client.from('workouts').select(WORKOUT_SELECT);

/** A workout with its logged exercises and their sets, as returned by the queries below. */
export type WorkoutRecord = QueryData<ReturnType<typeof workoutsQuery>>[number];
export type ExerciseRecord = TableRow<'exercises'>;

export const workoutSelect = WORKOUT_SELECT;

/** The signed-in user's own workouts, newest first. Never includes anyone else's. */
export async function listMyWorkouts(client: BroSplitClient): Promise<WorkoutRecord[]> {
  const userId = await requireUserId(client);
  const { data, error } = await workoutsQuery(client)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** One of the signed-in user's own workouts. Fails if the id belongs to someone else. */
export async function getMyWorkout(client: BroSplitClient, id: string): Promise<WorkoutRecord> {
  const userId = await requireUserId(client);
  const { data, error } = await workoutsQuery(client).eq('user_id', userId).eq('id', id).single();
  if (error) throw error;
  return data;
}

/**
 * The exercises the signed-in user can pick from: the global catalogue plus their own private
 * entries. Row Level Security also lets a coach read the exercise rows behind a client's workouts;
 * those are deliberately excluded here so a client's private entry can never be picked or matched.
 */
export async function listMyCatalogExercises(client: BroSplitClient): Promise<ExerciseRecord[]> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('exercises')
    .select('*')
    .or(`is_global.eq.true,owner_id.eq.${userId}`)
    .order('name');
  if (error) throw error;
  return data;
}
