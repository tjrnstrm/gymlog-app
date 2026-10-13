// Compares the legacy MongoDB source with what was imported into Postgres, record by record.
//
// Equal totals are not enough evidence (two wrong sets can cancel out), so this checks:
//   * every source exercise, workout, logged exercise and set has a mapping and a target row;
//   * field values: names, muscle groups, categories, brand, gym, notes, rating, template flag,
//     duration, dates, every set's reps and weight;
//   * identity: each logged exercise points at the target of the SAME source exercise, and each
//     exercise's base exercise maps to the same source base;
//   * order of logged exercises and sets inside each workout;
//   * timestamps, where the source had them;
//   * aggregates per workout and overall: counts, total volume (sum of reps x weight), date range;
//   * that the target belongs to the named owner and nothing mapped has been left behind in
//     Postgres after disappearing from the source.
import { normalizeUsername } from './import.ts';
import type { Sql } from './import.ts';
import type { MongoSource, RawWorkout } from './source.ts';

export interface Mismatch {
  where: string;
  message: string;
}

export interface ReconcileReport {
  sourceId: string;
  owner: string;
  checked: { exercises: number; workouts: number; workoutExercises: number; sets: number };
  source: { volume: number; firstDate: string | null; lastDate: string | null };
  target: { volume: number; firstDate: string | null; lastDate: string | null };
  mismatches: Mismatch[];
  ok: boolean;
}

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
const text = (v: string | null | undefined) => (v === undefined || v === null || v === '' ? null : v);
const sameList = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function reconcileLegacy(source: MongoSource, sql: Sql, ownerUsername: string): Promise<ReconcileReport> {
  const username = normalizeUsername(ownerUsername);
  const [owner] = await sql<{ id: string }[]>`select id from public.profiles where username = ${username}`;
  if (!owner) throw new Error(`No user with the username "${username}".`);

  const mismatches: Mismatch[] = [];
  const bad = (where: string, message: string) => mismatches.push({ where, message });

  const maps = await sql<{ collection: string; source_id: string; target_id: string; owner_id: string }[]>`
    select collection, source_id, target_id, owner_id from public.legacy_import_map where source = ${source.sourceId}`;
  const mapOf = (collection: string) => new Map(maps.filter((m) => m.collection === collection).map((m) => [m.source_id, m]));
  const exMap = mapOf('exercise');
  const woMap = mapOf('workout');
  const weMap = mapOf('workout_exercise');
  const seMap = mapOf('set');

  /* ---- exercises ---- */
  const exRows = await sql<
    { id: string; name: string; muscle_groups: string[]; category: string[]; brand: string | null; base_exercise_id: string | null; owner_id: string | null; is_global: boolean; created_at: Date; updated_at: Date }[]
  >`select id, name, muscle_groups, category, brand, base_exercise_id, owner_id, is_global, created_at, updated_at
    from public.exercises where id = any(${[...exMap.values()].map((m) => m.target_id)}::uuid[])`;
  const exById = new Map(exRows.map((r) => [r.id, r]));

  for (const e of source.exercises) {
    const where = `exercise:${e._id} "${e.name}"`;
    const m = exMap.get(e._id);
    const row = m && exById.get(m.target_id);
    if (!m || !row) {
      bad(where, 'Not imported.');
      continue;
    }
    if (row.owner_id !== owner.id || row.is_global) bad(where, 'Is not a private exercise of the named owner.');
    if (row.name !== e.name.trim()) bad(where, `Name differs: "${row.name}"`);
    if (!sameList(row.muscle_groups, e.muscleGroups ?? [])) bad(where, 'Muscle groups differ.');
    if (!sameList(row.category, e.category ?? [])) bad(where, 'Categories differ.');
    if (text(row.brand) !== text(e.brand)) bad(where, `Brand differs: ${row.brand}`);
    const expectedBase = e.baseExercise ? exMap.get(e.baseExercise)?.target_id ?? null : null;
    if ((row.base_exercise_id ?? null) !== expectedBase) bad(where, 'Base exercise differs.');
    if (e.createdAt && row.created_at.getTime() !== time(e.createdAt)) bad(where, 'created_at differs.');
    if (e.updatedAt && row.updated_at.getTime() !== time(e.updatedAt)) bad(where, 'updated_at differs.');
  }

  /* ---- workouts ---- */
  const woRows = await sql<
    { id: string; user_id: string; name: string; gym: string | null; date: Date; notes: string | null; rating: number | null; is_template: boolean; duration_seconds: number | null; created_at: Date; updated_at: Date }[]
  >`select id, user_id, name, gym, date, notes, rating, is_template, duration_seconds, created_at, updated_at
    from public.workouts where id = any(${[...woMap.values()].map((m) => m.target_id)}::uuid[])`;
  const woById = new Map(woRows.map((r) => [r.id, r]));

  const weRows = await sql<{ id: string; workout_id: string; exercise_id: string; exercise_name: string }[]>`
    select id, workout_id, exercise_id, exercise_name from public.workout_exercises
    where workout_id = any(${woRows.map((r) => r.id)}::uuid[]) order by created_at, id`;
  const weByWorkout = new Map<string, (typeof weRows)[number][]>();
  for (const r of weRows) weByWorkout.set(r.workout_id, [...(weByWorkout.get(r.workout_id) ?? []), r]);

  const seRows = await sql<{ id: string; workout_exercise_id: string; reps: number; weight: number }[]>`
    select id, workout_exercise_id, reps, weight from public.sets
    where workout_exercise_id = any(${weRows.map((r) => r.id)}::uuid[]) order by created_at, id`;
  const seByWe = new Map<string, (typeof seRows)[number][]>();
  for (const r of seRows) seByWe.set(r.workout_exercise_id, [...(seByWe.get(r.workout_exercise_id) ?? []), r]);

  const checked = { exercises: source.exercises.length, workouts: 0, workoutExercises: 0, sets: 0 };
  let sourceVolume = 0;
  let targetVolume = 0;
  const sourceDates: number[] = [];
  const targetDates: number[] = [];

  const volume = (w: RawWorkout) => w.exercises.reduce((n, we) => n + we.sets.reduce((m, s) => m + s.reps * s.weight, 0), 0);

  for (const w of source.workouts) {
    const where = `workout:${w._id} "${w.name}"`;
    checked.workouts += 1;
    sourceVolume += volume(w);
    sourceDates.push(new Date(w.date).getTime());

    const m = woMap.get(w._id);
    const row = m && woById.get(m.target_id);
    if (!m || !row) {
      bad(where, 'Not imported.');
      continue;
    }
    targetDates.push(row.date.getTime());
    if (row.user_id !== owner.id) bad(where, 'Belongs to a different user.');
    if (row.name !== w.name.trim()) bad(where, `Name differs: "${row.name}"`);
    if (text(row.gym) !== text(w.gym)) bad(where, `Gym differs: ${row.gym}`);
    if (row.date.getTime() !== new Date(w.date).getTime()) bad(where, `Date differs: ${row.date.toISOString()} vs ${w.date}`);
    if (text(row.notes) !== text(w.notes)) bad(where, 'Notes differ.');
    if ((row.rating ?? null) !== (w.rating ?? null)) bad(where, `Rating differs: ${row.rating}`);
    if (row.is_template !== (w.isTemplate ?? false)) bad(where, 'Template flag differs.');
    if ((row.duration_seconds ?? null) !== (w.durationSeconds ?? null)) bad(where, `Duration differs: ${row.duration_seconds}`);
    if (w.createdAt && row.created_at.getTime() !== time(w.createdAt)) bad(where, 'created_at differs.');
    if (w.updatedAt && row.updated_at.getTime() !== time(w.updatedAt)) bad(where, 'updated_at differs.');

    const targetExercises = weByWorkout.get(row.id) ?? [];
    if (targetExercises.length !== w.exercises.length) {
      bad(where, `Logged exercise count differs: ${targetExercises.length} vs ${w.exercises.length}`);
    }

    let targetWorkoutVolume = 0;
    w.exercises.forEach((we, ei) => {
      checked.workoutExercises += 1;
      const weWhere = `${where} exercise #${ei + 1} "${we.exerciseName}"`;
      const sid = `${w._id}/${we._id ?? `#${ei}`}`;
      const weMapped = weMap.get(sid);
      const target = targetExercises[ei]; // same position = same order
      if (!weMapped || !target) {
        bad(weWhere, 'Not imported.');
        return;
      }
      if (weMapped.target_id !== target.id) bad(weWhere, 'Order differs: the mapped row is not at the same position.');
      if (target.exercise_name !== we.exerciseName.trim()) bad(weWhere, `Name differs: "${target.exercise_name}"`);
      const expectedExercise = exMap.get(we.exerciseId)?.target_id;
      if (target.exercise_id !== expectedExercise) bad(weWhere, 'Points at a different exercise than the source.');

      const targetSets = seByWe.get(target.id) ?? [];
      if (targetSets.length !== we.sets.length) bad(weWhere, `Set count differs: ${targetSets.length} vs ${we.sets.length}`);
      we.sets.forEach((s, si) => {
        checked.sets += 1;
        const sWhere = `${weWhere} set #${si + 1}`;
        const setMapped = seMap.get(`${sid}/${s._id ?? `#${si}`}`);
        const ts = targetSets[si];
        if (!setMapped || !ts) {
          bad(sWhere, 'Not imported.');
          return;
        }
        if (setMapped.target_id !== ts.id) bad(sWhere, 'Order differs: the mapped row is not at the same position.');
        if (ts.reps !== s.reps) bad(sWhere, `Reps differ: ${ts.reps} vs ${s.reps}`);
        if (ts.weight !== s.weight) bad(sWhere, `Weight differs: ${ts.weight} vs ${s.weight}`);
      });
      targetWorkoutVolume += targetSets.reduce((n, s) => n + s.reps * s.weight, 0);
    });
    targetVolume += targetWorkoutVolume;
    if (Math.abs(targetWorkoutVolume - volume(w)) > 1e-6) bad(where, `Total volume differs: ${targetWorkoutVolume} vs ${volume(w)}`);
  }

  /* ---- things left in Postgres that the source no longer has ---- */
  const sourceWorkoutIds = new Set(source.workouts.map((w) => w._id));
  for (const [sourceId] of woMap) if (!sourceWorkoutIds.has(sourceId)) bad(`workout:${sourceId}`, 'Imported earlier but no longer in the source.');
  const sourceExerciseIds = new Set(source.exercises.map((e) => e._id));
  for (const [sourceId] of exMap) if (!sourceExerciseIds.has(sourceId)) bad(`exercise:${sourceId}`, 'Imported earlier but no longer in the source.');

  const iso = (xs: number[]) => (xs.length ? new Date(Math.min(...xs)).toISOString() : null);
  const isoMax = (xs: number[]) => (xs.length ? new Date(Math.max(...xs)).toISOString() : null);
  if (Math.abs(sourceVolume - targetVolume) > 1e-6) bad('overall', `Total volume differs: ${targetVolume} vs ${sourceVolume}`);
  if (iso(sourceDates) !== iso(targetDates) || isoMax(sourceDates) !== isoMax(targetDates)) bad('overall', 'Date range differs.');

  return {
    sourceId: source.sourceId,
    owner: username,
    checked,
    source: { volume: sourceVolume, firstDate: iso(sourceDates), lastDate: isoMax(sourceDates) },
    target: { volume: targetVolume, firstDate: iso(targetDates), lastDate: isoMax(targetDates) },
    mismatches,
    ok: mismatches.length === 0,
  };
}

export function describeReconcile(r: ReconcileReport): string {
  const lines = [
    `Source: ${r.sourceId}`,
    `Owner:  @${r.owner}`,
    `Checked ${r.checked.exercises} exercises, ${r.checked.workouts} workouts, ${r.checked.workoutExercises} logged exercises, ${r.checked.sets} sets.`,
    `Volume (sum of reps x weight): source ${r.source.volume}, postgres ${r.target.volume}`,
    `Dates: source ${r.source.firstDate} .. ${r.source.lastDate}; postgres ${r.target.firstDate} .. ${r.target.lastDate}`,
    r.ok ? 'RECONCILED: no differences.' : `MISMATCHES: ${r.mismatches.length}`,
  ];
  for (const m of r.mismatches.slice(0, 200)) lines.push(`  ${m.where}: ${m.message}`);
  if (r.mismatches.length > 200) lines.push(`  ... and ${r.mismatches.length - 200} more`);
  return lines.join('\n');
}
