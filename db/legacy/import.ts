// Imports the legacy MongoDB history into Postgres.
//
// Guarantees (all covered by db/tests/legacy-import.test.ts):
//   * Dry run by default: planning reads the database and writes nothing.
//   * Idempotent: every source record is recorded in legacy_import_map; a rerun skips what is
//     already imported and reports (instead of overwriting) anything whose source changed.
//   * Atomic: the profile + exercise catalogue commit together with their mappings, and each
//     workout commits together with its exercises, sets and mappings. A failure rolls back that
//     unit only, and a retry continues without duplicates.
//   * Explicit owner: everything is imported for the named user; imported exercises are that user's
//     PRIVATE exercises.
//   * One import of a source at a time (advisory lock).
//   * Nothing invalid is silently dropped: orphaned references, bad values and changed sources are
//     reported as issues, and any error makes the run unsuccessful.
//
// Timestamps: workouts and exercises keep their original createdAt/updatedAt when the source has
// them. The nested exercises and sets have none and no position column exists, so their order is
// preserved with synthetic created_at values (workout time + 1 ms per position).
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { contentHash } from './source.ts';
import type { MongoSource, RawExercise, RawWorkout } from './source.ts';

export type Sql = ReturnType<typeof postgres>;

export interface Issue {
  level: 'error' | 'warning';
  /** exercise / workout failures can be skipped with allowSkipInvalid; the rest always block. */
  scope: 'source' | 'exercise' | 'workout' | 'mapping' | 'owner';
  where: string;
  message: string;
}

export interface Counts {
  profile: number;
  exercises: number;
  workouts: number;
  workoutExercises: number;
  sets: number;
}

export interface ImportReport {
  sourceId: string;
  owner: { username: string; id: string };
  applied: boolean;
  /** What a run would create (dry run) - or, after --apply, what was left to do before it ran. */
  planned: Counts;
  created: Counts;
  /** Already imported and unchanged. */
  skipped: Counts;
  issues: Issue[];
  /** No errors. */
  ok: boolean;
}

export interface ImportOptions {
  apply: boolean;
  /** Import the valid workouts and report the invalid ones, instead of refusing to apply. */
  allowSkipInvalid?: boolean;
  /** Test hook: runs inside each workout's transaction after its rows are inserted, before commit. */
  hooks?: { afterWorkoutRows?: (workoutSourceId: string) => void | Promise<void> };
  log?: (line: string) => void;
}

const zero = (): Counts => ({ profile: 0, exercises: 0, workouts: 0, workoutExercises: 0, sets: 0 });
const add = (a: Counts, b: Partial<Counts>) => {
  for (const k of Object.keys(b) as (keyof Counts)[]) a[k] += b[k] ?? 0;
};

interface Mapping {
  target_table: string;
  target_id: string;
  owner_id: string;
  source_hash: string;
}
type MappingKey = string;
const mkey = (collection: string, sourceId: string): MappingKey => `${collection}\u0000${sourceId}`;

export const normalizeUsername = (u: string) => u.trim().replace(/^@+/, '').toLowerCase();

/* ------------------------------ source-derived identifiers and hashes ------------------------------ */

const workoutExerciseSourceId = (w: RawWorkout, index: number) => `${w._id}/${w.exercises[index]._id ?? `#${index}`}`;
const setSourceId = (w: RawWorkout, ei: number, si: number) =>
  `${workoutExerciseSourceId(w, ei)}/${w.exercises[ei].sets[si]._id ?? `#${si}`}`;

export const exerciseHash = (e: RawExercise) =>
  contentHash({
    name: e.name,
    muscleGroups: e.muscleGroups ?? [],
    category: e.category ?? [],
    brand: e.brand || null,
    baseExercise: e.baseExercise ?? null,
    createdAt: e.createdAt ?? null,
    updatedAt: e.updatedAt ?? null,
  });

/** Covers the workout's own fields AND its whole tree, so any added/removed/edited set shows up. */
export const workoutHash = (w: RawWorkout) =>
  contentHash({
    name: w.name,
    gym: w.gym || null,
    date: w.date,
    notes: w.notes || null,
    rating: w.rating ?? null,
    isTemplate: w.isTemplate ?? false,
    durationSeconds: w.durationSeconds ?? null,
    createdAt: w.createdAt ?? null,
    updatedAt: w.updatedAt ?? null,
    exercises: w.exercises.map((we, ei) => ({
      id: we._id,
      exerciseId: we.exerciseId,
      exerciseName: we.exerciseName,
      sets: we.sets.map((s, si) => ({ id: setSourceId(w, ei, si), reps: s.reps, weight: s.weight })),
    })),
  });

const workoutExerciseHash = (w: RawWorkout, ei: number) =>
  contentHash({ exerciseId: w.exercises[ei].exerciseId, exerciseName: w.exercises[ei].exerciseName, position: ei });
const setHash = (w: RawWorkout, ei: number, si: number) =>
  contentHash({ reps: w.exercises[ei].sets[si].reps, weight: w.exercises[ei].sets[si].weight, position: si });

const parseTime = (value: string | null | undefined): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/* ------------------------------------------- validation ------------------------------------------- */

function validate(source: MongoSource): Issue[] {
  const issues: Issue[] = [];
  const err = (scope: Issue['scope'], where: string, message: string) => issues.push({ level: 'error', scope, where, message });

  const seen = new Set<string>();
  for (const e of source.exercises) {
    if (seen.has(e._id)) err('source', `exercise:${e._id}`, 'Duplicate exercise _id in the source.');
    seen.add(e._id);
  }
  const exerciseIds = new Set(source.exercises.map((e) => e._id));

  for (const e of source.exercises) {
    const where = `exercise:${e._id}`;
    if (typeof e.name !== 'string' || e.name.trim() === '') err('exercise', where, 'Exercise has no name.');
    if (e.baseExercise && !exerciseIds.has(e.baseExercise)) err('exercise', where, `Base exercise ${e.baseExercise} does not exist in the source.`);
    if (e.baseExercise === e._id) err('exercise', where, 'Exercise is its own base exercise.');
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (e[field] && !parseTime(e[field])) err('exercise', where, `${field} is not a valid time: ${e[field]}`);
    }
  }
  // base-exercise cycles
  for (const e of source.exercises) {
    const trail = new Set<string>([e._id]);
    let cur = e.baseExercise;
    while (cur && exerciseIds.has(cur)) {
      if (trail.has(cur)) {
        err('exercise', `exercise:${e._id}`, 'Base exercises form a cycle.');
        break;
      }
      trail.add(cur);
      cur = source.exercises.find((x) => x._id === cur)?.baseExercise;
    }
  }

  const workoutIds = new Set<string>();
  for (const w of source.workouts) {
    const where = `workout:${w._id}`;
    if (workoutIds.has(w._id)) err('source', where, 'Duplicate workout _id in the source.');
    workoutIds.add(w._id);

    if (typeof w.name !== 'string' || w.name.trim() === '') err('workout', where, 'Workout has no name.');
    if (!parseTime(w.date)) err('workout', where, `Workout date is not a valid time: ${JSON.stringify(w.date)}`);
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (w[field] && !parseTime(w[field])) err('workout', where, `${field} is not a valid time: ${w[field]}`);
    }
    if (w.rating != null && !Number.isInteger(w.rating)) err('workout', where, `Rating is not a whole number: ${w.rating}`);
    if (w.durationSeconds != null && (!Number.isInteger(w.durationSeconds) || w.durationSeconds < 0)) {
      err('workout', where, `Duration is not a non-negative whole number: ${w.durationSeconds}`);
    }

    (w.exercises ?? []).forEach((we, ei) => {
      const weWhere = `${where} exercise #${ei + 1} "${we.exerciseName}"`;
      if (!exerciseIds.has(we.exerciseId)) err('workout', weWhere, `Orphan: exercise ${we.exerciseId} does not exist in the source.`);
      if (typeof we.exerciseName !== 'string' || we.exerciseName.trim() === '') err('workout', weWhere, 'Logged exercise has no name.');
      (we.sets ?? []).forEach((s, si) => {
        const sWhere = `${weWhere} set #${si + 1}`;
        if (!Number.isInteger(s.reps) || s.reps < 0) err('workout', sWhere, `Reps is not a non-negative whole number: ${s.reps}`);
        if (typeof s.weight !== 'number' || !Number.isFinite(s.weight) || s.weight < 0) err('workout', sWhere, `Weight is not a non-negative number: ${s.weight}`);
      });
    });
  }

  if (source.profiles.length > 1) {
    err('source', 'profiles', `The source has ${source.profiles.length} profiles; this importer expects exactly one (the app had a single user).`);
  }
  return issues;
}

/* --------------------------------------------- planning --------------------------------------------- */

async function loadMappings(sql: Sql, sourceId: string): Promise<Map<MappingKey, Mapping>> {
  const rows = await sql<(Mapping & { collection: string; source_id: string })[]>`
    select collection, source_id, target_table, target_id, owner_id, source_hash
    from public.legacy_import_map where source = ${sourceId}`;
  return new Map(rows.map((r) => [mkey(r.collection, r.source_id), r]));
}

async function existingTargets(sql: Sql, table: 'exercises' | 'workouts' | 'workout_exercises' | 'sets', ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sql<{ id: string }[]>`select id from ${sql(`public.${table}`)} where id = any(${ids}::uuid[])`;
  return new Set(rows.map((r) => r.id));
}

interface Plan {
  issues: Issue[];
  newExercises: RawExercise[];
  newWorkouts: RawWorkout[];
  skippedWorkouts: RawWorkout[];
  profileToImport: boolean;
  planned: Counts;
  skipped: Counts;
  invalidWorkoutIds: Set<string>;
}

async function plan(source: MongoSource, sql: Sql, ownerId: string): Promise<Plan> {
  const issues = validate(source);
  const mappings = await loadMappings(sql, source.sourceId);

  const workoutErrors = new Set<string>();
  for (const i of issues) {
    if (i.level === 'error' && i.scope === 'workout') workoutErrors.add(i.where.split(' ')[0].replace(/^workout:/, ''));
  }

  // Verify existing mappings against owner, content and the target row.
  const check = async (
    collection: string,
    table: 'exercises' | 'workouts' | 'workout_exercises' | 'sets',
    entries: { sourceId: string; hash: string; label: string }[],
  ) => {
    const mapped = entries.flatMap((e) => {
      const m = mappings.get(mkey(collection, e.sourceId));
      return m ? [{ ...e, m }] : [];
    });
    const present = await existingTargets(sql, table, mapped.map((x) => x.m.target_id));
    for (const { sourceId, hash, label, m } of mapped) {
      if (m.owner_id !== ownerId) issues.push({ level: 'error', scope: 'mapping', where: label, message: `Already imported for a different user (${sourceId}).` });
      else if (!present.has(m.target_id)) issues.push({ level: 'error', scope: 'mapping', where: label, message: `Mapped to ${table} row ${m.target_id}, which no longer exists.` });
      else if (m.source_hash !== hash) issues.push({ level: 'error', scope: 'mapping', where: label, message: 'The source record changed since it was imported; it was not overwritten.' });
    }
  };

  await check('exercise', 'exercises', source.exercises.map((e) => ({ sourceId: e._id, hash: exerciseHash(e), label: `exercise:${e._id}` })));
  await check('workout', 'workouts', source.workouts.map((w) => ({ sourceId: w._id, hash: workoutHash(w), label: `workout:${w._id}` })));

  const newExercises = source.exercises.filter((e) => !mappings.has(mkey('exercise', e._id)));
  const newWorkouts: RawWorkout[] = [];
  const skippedWorkouts: RawWorkout[] = [];
  for (const w of source.workouts) {
    if (mappings.has(mkey('workout', w._id))) skippedWorkouts.push(w);
    else if (!workoutErrors.has(w._id)) newWorkouts.push(w);
  }

  const countTree = (ws: RawWorkout[]): Partial<Counts> => ({
    workouts: ws.length,
    workoutExercises: ws.reduce((n, w) => n + w.exercises.length, 0),
    sets: ws.reduce((n, w) => n + w.exercises.reduce((m, we) => m + we.sets.length, 0), 0),
  });

  const profileToImport = source.profiles.length === 1 && !mappings.has(mkey('profile', source.profiles[0]._id));
  if (source.profiles[0]?.avatarUrl) {
    issues.push({
      level: 'warning',
      scope: 'source',
      where: `profile:${source.profiles[0]._id}`,
      message: 'The avatar URL points at the retired upload server and is not imported. The files are in legacy-uploads/; re-upload through the app.',
    });
  }

  const planned = zero();
  add(planned, { profile: profileToImport ? 1 : 0, exercises: newExercises.length, ...countTree(newWorkouts) });
  const skipped = zero();
  add(skipped, { profile: source.profiles.length === 1 && !profileToImport ? 1 : 0, exercises: source.exercises.length - newExercises.length, ...countTree(skippedWorkouts) });

  return { issues, newExercises, newWorkouts, skippedWorkouts, profileToImport, planned, skipped, invalidWorkoutIds: workoutErrors };
}

/* ---------------------------------------------- apply ---------------------------------------------- */

/** Exercises ordered so that a base exercise always comes before the variants built on it. */
function dependencyOrder(exercises: RawExercise[], alreadyMapped: (id: string) => boolean): RawExercise[] {
  const pending = [...exercises];
  const done = new Set<string>();
  const ordered: RawExercise[] = [];
  while (pending.length > 0) {
    const before = pending.length;
    for (let i = 0; i < pending.length; ) {
      const e = pending[i];
      if (!e.baseExercise || done.has(e.baseExercise) || alreadyMapped(e.baseExercise)) {
        ordered.push(e);
        done.add(e._id);
        pending.splice(i, 1);
      } else {
        i += 1;
      }
    }
    if (pending.length === before) throw new Error('Base exercises form a cycle or reference an unknown exercise.');
  }
  return ordered;
}

export async function importLegacy(
  source: MongoSource,
  sql: Sql,
  ownerUsername: string,
  options: ImportOptions,
): Promise<ImportReport> {
  const log = options.log ?? (() => {});
  const username = normalizeUsername(ownerUsername);
  const [owner] = await sql<{ id: string }[]>`select id from public.profiles where username = ${username}`;
  if (!owner) throw new Error(`No user with the username "${username}". The user must sign up first.`);

  const p = await plan(source, sql, owner.id);
  const report: ImportReport = {
    sourceId: source.sourceId,
    owner: { username, id: owner.id },
    applied: false,
    planned: p.planned,
    created: zero(),
    skipped: p.skipped,
    issues: p.issues,
    ok: !p.issues.some((i) => i.level === 'error'),
  };

  if (!options.apply) return report;

  // Refuse to write while anything blocks the run. Invalid workouts can be skipped on request,
  // everything else (bad exercises, changed/missing mappings, owner conflicts) must be fixed first.
  const blocking = p.issues.filter((i) => i.level === 'error' && !(options.allowSkipInvalid && i.scope === 'workout'));
  if (blocking.length > 0) {
    log(`Refusing to apply: ${blocking.length} unresolved error(s).`);
    return report;
  }

  // One import of this source at a time.
  const lock = await sql.reserve();
  try {
    const [{ got }] = await lock<{ got: boolean }[]>`select pg_try_advisory_lock(hashtextextended(${source.sourceId}, 0)) as got`;
    if (!got) throw new Error(`Another import of ${source.sourceId} is already running.`);

    try {
      const importedAt = new Date();
      const mappingRows: { source: string; collection: string; source_id: string; target_table: string; target_id: string; owner_id: string; source_hash: string }[] = [];
      const mapping = (collection: string, sourceId: string, table: string, targetId: string, hash: string) =>
        mappingRows.push({ source: source.sourceId, collection, source_id: sourceId, target_table: table, target_id: targetId, owner_id: owner.id, source_hash: hash });

      // ---- unit 1: profile fields + exercise catalogue, with their mappings ----
      const exerciseTarget = new Map<string, string>(); // source exercise id -> uuid
      const existing = await loadMappings(lock, source.sourceId);
      for (const e of source.exercises) {
        const m = existing.get(mkey('exercise', e._id));
        if (m) exerciseTarget.set(e._id, m.target_id);
      }

      await sql.begin(async (tx) => {
        mappingRows.length = 0;
        if (p.profileToImport) {
          const pr = source.profiles[0];
          // Fill blanks only: never overwrite what the user has already set on their account.
          await tx`
            update public.profiles
            set name = coalesce(nullif(name, ''), ${pr.name?.trim() || null}),
                age = coalesce(age, ${pr.age ?? null})
            where id = ${owner.id}`;
          mapping('profile', pr._id, 'profiles', owner.id, contentHash({ name: pr.name ?? null, age: pr.age ?? null, avatarUrl: pr.avatarUrl ?? null }));
        }

        const ordered = dependencyOrder(p.newExercises, (id) => exerciseTarget.has(id));
        for (const e of ordered) exerciseTarget.set(e._id, randomUUID());
        if (ordered.length > 0) {
          const rows = ordered.map((e) => {
            const created = parseTime(e.createdAt) ?? importedAt;
            return {
              id: exerciseTarget.get(e._id)!,
              name: e.name.trim(),
              muscle_groups: tx.array(e.muscleGroups ?? []),
              category: tx.array(e.category ?? []),
              brand: e.brand || null,
              base_exercise_id: e.baseExercise ? exerciseTarget.get(e.baseExercise)! : null,
              owner_id: owner.id,
              is_global: false,
              created_at: created,
              updated_at: parseTime(e.updatedAt) ?? created,
            };
          });
          // base_exercise_id is checked per row by a trigger, so bases must already exist: insert one at a time in dependency order.
          for (const row of rows) {
            await tx`insert into public.exercises ${tx(row, 'id', 'name', 'muscle_groups', 'category', 'brand', 'base_exercise_id', 'owner_id', 'is_global', 'created_at', 'updated_at')}`;
          }
          for (const e of ordered) mapping('exercise', e._id, 'exercises', exerciseTarget.get(e._id)!, exerciseHash(e));
        }
        if (mappingRows.length > 0) {
          await tx`insert into public.legacy_import_map ${tx(mappingRows, 'source', 'collection', 'source_id', 'target_table', 'target_id', 'owner_id', 'source_hash')}`;
        }
      });
      add(report.created, { profile: p.profileToImport ? 1 : 0, exercises: p.newExercises.length });
      log(`Imported ${p.newExercises.length} exercise(s)${p.profileToImport ? ' and the profile fields' : ''}.`);

      // ---- unit 2..n: one transaction per workout ----
      for (const w of p.newWorkouts) {
        let wrote = false;
        await sql.begin(async (tx) => {
          const [already] = await tx`select 1 from public.legacy_import_map where source = ${source.sourceId} and collection = 'workout' and source_id = ${w._id}`;
          if (already) return; // imported by someone else since planning
          wrote = true;

          const workoutId = randomUUID();
          const created = parseTime(w.createdAt) ?? importedAt;
          const rows: typeof mappingRows = [];
          const push = (collection: string, sourceId: string, table: string, targetId: string, hash: string) =>
            rows.push({ source: source.sourceId, collection, source_id: sourceId, target_table: table, target_id: targetId, owner_id: owner.id, source_hash: hash });

          await tx`
            insert into public.workouts (id, user_id, name, gym, date, notes, rating, is_template, duration_seconds, created_at, updated_at)
            values (${workoutId}, ${owner.id}, ${w.name.trim()}, ${w.gym || null}, ${parseTime(w.date)!}, ${w.notes || null},
                    ${w.rating ?? null}, ${w.isTemplate ?? false}, ${w.durationSeconds ?? null}, ${created}, ${parseTime(w.updatedAt) ?? created})`;
          push('workout', w._id, 'workouts', workoutId, workoutHash(w));

          const weRows: Record<string, unknown>[] = [];
          const setRows: Record<string, unknown>[] = [];
          w.exercises.forEach((we, ei) => {
            const weId = randomUUID();
            weRows.push({
              id: weId,
              workout_id: workoutId,
              exercise_id: exerciseTarget.get(we.exerciseId)!,
              exercise_name: we.exerciseName.trim(),
              created_at: new Date(created.getTime() + ei),
            });
            push('workout_exercise', workoutExerciseSourceId(w, ei), 'workout_exercises', weId, workoutExerciseHash(w, ei));
            we.sets.forEach((s, si) => {
              const setId = randomUUID();
              setRows.push({ id: setId, workout_exercise_id: weId, reps: s.reps, weight: s.weight, created_at: new Date(created.getTime() + si) });
              push('set', setSourceId(w, ei, si), 'sets', setId, setHash(w, ei, si));
            });
          });
          if (weRows.length > 0) await tx`insert into public.workout_exercises ${tx(weRows, 'id', 'workout_id', 'exercise_id', 'exercise_name', 'created_at')}`;
          if (setRows.length > 0) await tx`insert into public.sets ${tx(setRows, 'id', 'workout_exercise_id', 'reps', 'weight', 'created_at')}`;

          await options.hooks?.afterWorkoutRows?.(w._id);

          await tx`insert into public.legacy_import_map ${tx(rows, 'source', 'collection', 'source_id', 'target_table', 'target_id', 'owner_id', 'source_hash')}`;
        });
        if (wrote) {
          add(report.created, {
            workouts: 1,
            workoutExercises: w.exercises.length,
            sets: w.exercises.reduce((n, we) => n + we.sets.length, 0),
          });
        }
      }
      log(`Imported ${report.created.workouts} workout(s).`);
    } finally {
      await lock`select pg_advisory_unlock(hashtextextended(${source.sourceId}, 0))`;
    }
  } finally {
    lock.release();
  }

  report.applied = true;
  // Skipped invalid workouts are still unresolved: the run is not clean until they are fixed.
  report.ok = !report.issues.some((i) => i.level === 'error');
  return report;
}

export function describeReport(report: ImportReport): string {
  const c = (x: Counts) => `${x.profile} profile, ${x.exercises} exercises, ${x.workouts} workouts, ${x.workoutExercises} logged exercises, ${x.sets} sets`;
  const lines = [
    `Source: ${report.sourceId}`,
    `Owner:  @${report.owner.username}`,
    report.applied ? 'Mode:   APPLIED' : 'Mode:   dry run (nothing written)',
    `Already imported and unchanged: ${c(report.skipped)}`,
    report.applied ? `Created: ${c(report.created)}` : `Would create: ${c(report.planned)}`,
  ];
  if (report.issues.length > 0) {
    lines.push('', `Issues (${report.issues.filter((i) => i.level === 'error').length} error(s), ${report.issues.filter((i) => i.level === 'warning').length} warning(s)):`);
    for (const i of report.issues) lines.push(`  [${i.level}] ${i.where}: ${i.message}`);
  }
  return lines.join('\n');
}
