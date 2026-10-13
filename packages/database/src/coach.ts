// Queries a coach makes about a CLIENT's data. Kept apart from personal.ts on purpose.
//
// Row Level Security is what authorizes this: rows come back only while the caller has an active
// coach plan and an accepted relationship with that client (see can_read_training in the
// migrations). The functions here only make the intent explicit; they are not a security boundary.
import type { BroSplitClient } from './client.ts';
import { assertUuid } from './client.ts';
import type { WorkoutRecord } from './personal.ts';
import { workoutSelect } from './personal.ts';

/**
 * One chosen client's workouts, newest first. The client id must come from an explicit selection
 * (for example the client the coach opened), never from "everything RLS lets me see".
 * No UI uses this in Milestone 1.
 */
export async function listClientWorkouts(client: BroSplitClient, clientId: string): Promise<WorkoutRecord[]> {
  assertUuid(clientId, 'client id');
  const { data, error } = await client
    .from('workouts')
    .select(workoutSelect)
    .eq('user_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
