// The shape of the legacy MongoDB data, and the one function that reads it.
//
// Everything downstream (import, reconcile, tests) works on plain JSON-like objects, so tests can
// inject a deterministic fixture and never need a Mongo server. loadMongoSource only ever READS:
// it calls find() on three collections and never writes to Mongo.
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

export interface RawSet {
  _id: string;
  reps: number;
  weight: number;
}

export interface RawWorkoutExercise {
  _id: string;
  exerciseId: string;
  exerciseName: string;
  sets: RawSet[];
}

export interface RawWorkout {
  _id: string;
  name: string;
  gym?: string | null;
  /** Stored by the old server as a string (ISO 8601 in practice). */
  date: string;
  notes?: string | null;
  exercises: RawWorkoutExercise[];
  rating?: number | null;
  isTemplate?: boolean | null;
  durationSeconds?: number | null;
  /** Mongoose timestamps. Absent on records written before timestamps were enabled. */
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RawExercise {
  _id: string;
  name: string;
  muscleGroups?: string[];
  category?: string[];
  brand?: string | null;
  baseExercise?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RawProfile {
  _id: string;
  name?: string | null;
  age?: number | null;
  avatarUrl?: string | null;
}

export interface MongoSource {
  /** Stable identifier of the source database, without credentials: `mongo:<host>/<database>`. */
  sourceId: string;
  profiles: RawProfile[];
  exercises: RawExercise[];
  workouts: RawWorkout[];
}

/** sha256 of a canonical JSON rendering (sorted keys), used to detect changed source records. */
export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** Source identifier for a connection string: host and database name only, never credentials. */
export function sourceIdFor(uri: string, database: string): string {
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'https://')).hostname;
  return `mongo:${host}/${database}`;
}

// Mongo documents contain ObjectIds and Dates; flatten them to strings so the rest is plain JSON.
const plain = <T>(doc: unknown): T =>
  JSON.parse(
    JSON.stringify(doc, (_key, value) => {
      if (value && typeof value === 'object' && (value as { _bsontype?: string })._bsontype === 'ObjectId') return String(value);
      return value;
    }),
  ) as T;

export async function loadMongoSource(uri: string): Promise<MongoSource> {
  const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
  await client.connect();
  try {
    const db = client.db();
    const [profiles, exercises, workouts] = await Promise.all([
      db.collection('profiles').find({}).sort({ _id: 1 }).toArray(),
      db.collection('exercises').find({}).sort({ _id: 1 }).toArray(),
      db.collection('workouts').find({}).sort({ _id: 1 }).toArray(),
    ]);
    return {
      sourceId: sourceIdFor(uri, db.databaseName),
      profiles: plain<RawProfile[]>(profiles),
      exercises: plain<RawExercise[]>(exercises),
      workouts: plain<RawWorkout[]>(workouts),
    };
  } finally {
    await client.close();
  }
}
