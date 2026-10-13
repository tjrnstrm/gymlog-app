import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

/** A Supabase client that knows the schema. Create it with `createClient<Database>(url, key)`. */
export type BroSplitClient = SupabaseClient<Database>;

type TableName = keyof Database['public']['Tables'];
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert'];
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update'];

/** One row returned by a set-returning database function (rpc). */
export type RpcRow<F extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][F]['Returns'] extends readonly (infer R)[] ? R : never;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws unless the value is a UUID. Guards ids that end up inside a PostgREST filter string. */
export function assertUuid(value: string, what = 'id'): string {
  if (!UUID.test(value)) throw new Error(`Invalid ${what}`);
  return value;
}

/**
 * The signed-in user's id, taken from the client's own session. Personal queries use this instead of
 * an id passed in by the caller, so a route parameter can never decide whose data is queried.
 * (Row Level Security remains the actual authorization; this keeps the query's intent explicit.)
 */
export async function requireUserId(client: BroSplitClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new Error('Not signed in');
  return assertUuid(id, 'user id');
}
