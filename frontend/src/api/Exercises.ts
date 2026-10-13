import { listMyCatalogExercises } from '@bro-split/database';
import type { TableRow, TableUpdate } from '@bro-split/database';
import { supabase } from '../lib/supabaseClient';
import type { IExercise } from '../types/Exercise';

type ExerciseRow = TableRow<'exercises'>;

function mapExercise(row: ExerciseRow): IExercise {
  return {
    _id: row.id,
    name: row.name,
    muscleGroups: row.muscle_groups ?? [],
    category: row.category ?? [],
    brand: row.brand ?? undefined,
    baseExercise: row.base_exercise_id ?? null,
    isGlobal: row.is_global,
    ownerId: row.owner_id,
  };
}

/**
 * The exercises the user can pick from: the shared catalogue plus their own private entries.
 * (A coach can also read the exercises behind a client's workouts; those are not part of this list.)
 */
export const getExercises = async (): Promise<IExercise[]> =>
  (await listMyCatalogExercises(supabase)).map(mapExercise);

export const getExercise = async (id: string): Promise<IExercise> => {
  const { data, error } = await supabase.from('exercises').select('*').eq('id', id).single();
  if (error) throw error;
  return mapExercise(data);
};

/** Creates a PRIVATE exercise. The database sets the owner to the signed-in user. */
export const createExercise = async (data: Partial<IExercise>): Promise<IExercise> => {
  if (!data.name) throw new Error('Give the exercise a name');
  const { data: row, error } = await supabase
    .from('exercises')
    .insert({
      name: data.name,
      muscle_groups: data.muscleGroups ?? [],
      category: data.category ?? [],
      brand: data.brand || null,
      base_exercise_id: data.baseExercise || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapExercise(row);
};

/** Only the owner can change a private exercise; the database refuses anything else. */
export const updateExercise = async (id: string, data: Partial<IExercise>): Promise<IExercise> => {
  const payload: TableUpdate<'exercises'> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.muscleGroups !== undefined) payload.muscle_groups = data.muscleGroups;
  if (data.category !== undefined) payload.category = data.category;
  if (data.brand !== undefined) payload.brand = data.brand || null;
  if (data.baseExercise !== undefined) payload.base_exercise_id = data.baseExercise || null;

  const { data: row, error } = await supabase
    .from('exercises')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapExercise(row);
};

export const deleteExercise = async (id: string) => {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) throw error;
};
