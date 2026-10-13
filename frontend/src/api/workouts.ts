import { supabase } from '../lib/supabaseClient';
import {
  getMyWorkout as fetchMyWorkout,
  listMyCatalogExercises,
  listMyWorkouts,
  normalizeExerciseName,
  resolveProgramExercises,
  workoutSelect,
} from '@bro-split/database';
import type { TableUpdate, WorkoutRecord } from '@bro-split/database';
import type { IWorkout, IWorkoutExercise, ISet } from '../types/Workout';

type SetRecord = WorkoutRecord['exercises'][number]['sets'][number];
type WorkoutExerciseRecord = WorkoutRecord['exercises'][number];

/** Rows have no position column, so creation time (then id, for ties) is the order. */
const byCreated = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

function mapSet(row: SetRecord): ISet {
  return { _id: row.id, reps: row.reps, weight: row.weight, createdAt: row.created_at };
}

function mapWorkoutExercise(row: WorkoutExerciseRecord): IWorkoutExercise {
  return {
    _id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    sets: [...(row.sets ?? [])].sort(byCreated).map(mapSet),
    createdAt: row.created_at,
  };
}

function mapWorkout(row: WorkoutRecord): IWorkout {
  return {
    _id: row.id,
    name: row.name,
    gym: row.gym ?? '',
    date: row.date,
    notes: row.notes ?? '',
    exercises: [...(row.exercises ?? [])].sort(byCreated).map(mapWorkoutExercise),
    rating: row.rating ?? undefined,
    isTemplate: row.is_template ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
  };
}

/**
 * The signed-in user's own workouts. There is deliberately no "all workouts RLS lets me read"
 * function: a coach can read their clients' workouts, and mixing them into History, templates,
 * gyms or personal bests is a bug. Reading a client's data goes through the coach helpers.
 */
export const getMyWorkouts = async (): Promise<IWorkout[]> => (await listMyWorkouts(supabase)).map(mapWorkout);

/** One of the signed-in user's own workouts; someone else's id behaves like a missing workout. */
export const getMyWorkout = async (id: string): Promise<IWorkout> => mapWorkout(await fetchMyWorkout(supabase, id));

export const createWorkout = async (data: Partial<IWorkout>): Promise<IWorkout> => {
  if (!data.name || !data.date) throw new Error('A workout needs a name and a date');
  const { data: row, error } = await supabase
    .from('workouts')
    .insert({
      name: data.name,
      gym: data.gym || null,
      date: data.date,
      notes: data.notes || null,
    })
    .select(workoutSelect)
    .single();
  if (error) throw error;
  return mapWorkout(row);
};

export const updateWorkout = async (id: string, data: Partial<IWorkout>): Promise<IWorkout> => {
  const payload: TableUpdate<'workouts'> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.gym !== undefined) payload.gym = data.gym;
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.rating !== undefined) payload.rating = data.rating;
  if (data.isTemplate !== undefined) payload.is_template = data.isTemplate;
  if (data.durationSeconds !== undefined) payload.duration_seconds = data.durationSeconds;

  const { data: row, error } = await supabase
    .from('workouts')
    .update(payload)
    .eq('id', id)
    .select(workoutSelect)
    .single();
  if (error) throw error;
  return mapWorkout(row);
};

export const deleteWorkout = async (id: string) => {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  if (error) throw error;
};

export const addExercise = async (
  workoutId: string,
  data: { exerciseId: string; exerciseName: string },
): Promise<IWorkout> => {
  const { error } = await supabase
    .from('workout_exercises')
    .insert({ workout_id: workoutId, exercise_id: data.exerciseId, exercise_name: data.exerciseName });
  if (error) throw error;
  return getMyWorkout(workoutId);
};

export const deleteExercise = async (_workoutId: string, exerciseId: string) => {
  const { error } = await supabase.from('workout_exercises').delete().eq('id', exerciseId);
  if (error) throw error;
};

export const addSet = async (
  workoutId: string,
  exerciseId: string,
  data: { reps: number; weight: number },
): Promise<IWorkout> => {
  const { error } = await supabase
    .from('sets')
    .insert({ workout_exercise_id: exerciseId, reps: data.reps, weight: data.weight });
  if (error) throw error;
  return getMyWorkout(workoutId);
};

export const updateSet = async (
  workoutId: string,
  _exerciseId: string,
  setId: string,
  data: { reps?: number; weight?: number },
): Promise<IWorkout> => {
  const { error } = await supabase.from('sets').update(data).eq('id', setId);
  if (error) throw error;
  return getMyWorkout(workoutId);
};

/**
 * Adds several sets to one logged exercise in a single insert (a drop set, myo-reps, a warm-up).
 * Pass explicit createdAt values to control where they sort: rows from one insert share a timestamp.
 */
export const addSets = async (
  workoutId: string,
  workoutExerciseId: string,
  rows: { reps: number; weight: number; createdAt?: string }[],
): Promise<IWorkout> => {
  const { error } = await supabase.from('sets').insert(
    rows.map((r) => ({
      workout_exercise_id: workoutExerciseId,
      reps: r.reps,
      weight: r.weight,
      ...(r.createdAt ? { created_at: r.createdAt } : {}),
    })),
  );
  if (error) throw error;
  return getMyWorkout(workoutId);
};

export const deleteSet = async (_workoutId: string, _exerciseId: string, setId: string) => {
  const { error } = await supabase.from('sets').delete().eq('id', setId);
  if (error) throw error;
};

export interface ProgramDayItem {
  name: string;
  sets: number | null;
  reps: string;
}

export interface AmbiguousExercise {
  /** Normalised name, the key to pass back in `choices`. */
  key: string;
  name: string;
  options: { id: string; name: string; isGlobal?: boolean }[];
}

/** Several of the user's exercises share the name of a programme exercise; they must pick one. */
export class AmbiguousExercisesError extends Error {
  ambiguous: AmbiguousExercise[];

  constructor(ambiguous: AmbiguousExercise[]) {
    super('Some exercises match more than one of your exercises');
    this.name = 'AmbiguousExercisesError';
    this.ambiguous = ambiguous;
  }
}

/**
 * Turns a coach's program day into a workout ready to log: one workout, its exercises and empty sets.
 *
 * Programme exercises are matched BY NAME against the user's own eligible catalogue (global entries
 * plus their private ones, never a client's private entry a coach can read). A name is reused only
 * when exactly one entry matches; if several do, this throws AmbiguousExercisesError and the caller
 * asks the user, then calls again with `choices` (normalised name -> exercise id). A name with no
 * match becomes a new private exercise.
 */
export const startWorkoutFromDay = async (
  dayName: string,
  items: ProgramDayItem[],
  choices: Record<string, string> = {},
): Promise<string> => {
  const catalog = await listMyCatalogExercises(supabase);
  const resolutions = resolveProgramExercises(
    items.map((i) => i.name),
    catalog.map((e) => ({ id: e.id, name: e.name, isGlobal: e.is_global })),
  );
  const displayName = new Map(items.map((i) => [normalizeExerciseName(i.name), i.name.trim()]));

  const idByName = new Map<string, string>();
  const ambiguous: AmbiguousExercise[] = [];
  const missing: { key: string; name: string }[] = [];
  resolutions.forEach((resolution, key) => {
    if (resolution.kind === 'match') {
      idByName.set(key, resolution.exerciseId);
    } else if (resolution.kind === 'ambiguous') {
      const chosen = choices[key];
      if (chosen && resolution.options.some((o) => o.id === chosen)) idByName.set(key, chosen);
      else ambiguous.push({ key, name: displayName.get(key) ?? key, options: resolution.options });
    } else {
      missing.push({ key, name: displayName.get(key) ?? key });
    }
  });
  if (ambiguous.length > 0) throw new AmbiguousExercisesError(ambiguous);

  if (missing.length > 0) {
    // owner_id defaults to the signed-in user in the database, so these are private entries.
    const { data: created, error: createError } = await supabase
      .from('exercises')
      .insert(missing.map(({ name }) => ({ name, muscle_groups: [], category: [] })))
      .select('id, name');
    if (createError) throw createError;
    (created ?? []).forEach((e) => idByName.set(normalizeExerciseName(e.name), e.id));
  }

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({ name: dayName, date: new Date().toISOString() })
    .select('id')
    .single();
  if (workoutError) throw workoutError;

  const { data: rows, error: rowsError } = await supabase
    .from('workout_exercises')
    .insert(
      items.map((i) => {
        const exerciseId = idByName.get(normalizeExerciseName(i.name));
        if (!exerciseId) throw new Error(`No exercise for "${i.name}"`);
        return { workout_id: workout.id, exercise_id: exerciseId, exercise_name: i.name };
      }),
    )
    .select('id');
  if (rowsError) throw rowsError;

  const sets = (rows ?? []).flatMap((row, index) => {
    const item = items[index];
    const reps = Number(item.reps.match(/d+/)?.[0] ?? 0);
    return Array.from({ length: Math.max(1, item.sets ?? 1) }, () => ({
      workout_exercise_id: row.id,
      reps,
      weight: 0,
    }));
  });
  if (sets.length > 0) {
    const { error: setsError } = await supabase.from('sets').insert(sets);
    if (setsError) throw setsError;
  }

  return workout.id as string;
};
