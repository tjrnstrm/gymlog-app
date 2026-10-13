// The Mongo importer and reconciler, exercised with a deterministic fixture (no Mongo server).
// This validates the TOOLS. Reconciling the real Atlas history is a separate run, reported separately.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importLegacy } from '../legacy/import.ts';
import { reconcileLegacy } from '../legacy/reconcile.ts';
import { sourceIdFor } from '../legacy/source.ts';
import type { MongoSource } from '../legacy/source.ts';
import { FIXTURE_IDS, FIXTURE_TOTALS, mongoFixture } from './fixtures/mongo-fixture.ts';
import { cleanup, createUser, makeSql, runId } from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let counter = 0;

beforeAll(() => {
  sql = makeSql();
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

/** A fresh owner and a fresh source id per test keep the tests independent. */
async function setup(label: string): Promise<{ owner: TestUser; source: MongoSource }> {
  counter += 1;
  const owner = await createUser(label);
  return { owner, source: mongoFixture(`mongo:fixture-${runId}/db${counter}`) };
}

async function rowCounts(ownerId: string) {
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  return {
    exercises: await one(sql`select count(*)::int as n from public.exercises where owner_id = ${ownerId}`),
    workouts: await one(sql`select count(*)::int as n from public.workouts where user_id = ${ownerId}`),
    workoutExercises: await one(sql`select count(*)::int as n from public.workout_exercises we join public.workouts w on w.id = we.workout_id where w.user_id = ${ownerId}`),
    sets: await one(sql`select count(*)::int as n from public.sets s join public.workout_exercises we on we.id = s.workout_exercise_id join public.workouts w on w.id = we.workout_id where w.user_id = ${ownerId}`),
    mappings: await one(sql`select count(*)::int as n from public.legacy_import_map where owner_id = ${ownerId}`),
  };
}

const EXPECTED = { ...FIXTURE_TOTALS };

describe('source identifiers', () => {
  it('never contain credentials', () => {
    const id = sourceIdFor('mongodb+srv://someone:s3cret@cluster0.abc.mongodb.net/gym?retryWrites=true', 'gym');
    expect(id).toBe('mongo:cluster0.abc.mongodb.net/gym');
    expect(id).not.toMatch(/someone|s3cret/);
  });
});

describe('dry run', () => {
  it('reports the plan and writes nothing', async () => {
    const { owner, source } = await setup('dry');
    const report = await importLegacy(source, sql, owner.username, { apply: false });

    expect(report.applied).toBe(false);
    expect(report.ok).toBe(true);
    expect(report.planned).toEqual({ profile: 1, ...EXPECTED });
    expect(report.created).toEqual({ profile: 0, exercises: 0, workouts: 0, workoutExercises: 0, sets: 0 });
    expect(report.issues.map((i) => i.level)).toEqual(['warning']); // the avatar URL is not imported
    expect(await rowCounts(owner.id)).toEqual({ exercises: 0, workouts: 0, workoutExercises: 0, sets: 0, mappings: 0 });
  });

  it('needs an existing user', async () => {
    const { source } = await setup('nouser');
    await expect(importLegacy(source, sql, `nobody_${runId}`, { apply: false })).rejects.toThrow(/No user/);
  });
});

describe('apply', () => {
  it('imports everything for the named owner, as private data, keeping timestamps and order', async () => {
    const { owner, source } = await setup('apply');
    await sql`update public.profiles set name = null, age = null where id = ${owner.id}`;

    const report = await importLegacy(source, sql, owner.username, { apply: true });
    expect(report.ok).toBe(true);
    expect(report.created).toEqual({ profile: 1, ...EXPECTED });

    const counts = await rowCounts(owner.id);
    expect(counts).toMatchObject(EXPECTED);
    // mappings: 1 profile + exercises + workouts + logged exercises + sets
    expect(counts.mappings).toBe(1 + EXPECTED.exercises + EXPECTED.workouts + EXPECTED.workoutExercises + EXPECTED.sets);

    // exercises are the owner's PRIVATE entries; the variant points at its base (listed after it in the source)
    const ex = await sql`select name, owner_id, is_global, base_exercise_id, id, created_at, updated_at, brand from public.exercises where owner_id = ${owner.id} order by name`;
    expect(ex.every((e) => e.owner_id === owner.id && e.is_global === false)).toBe(true);
    const bench = ex.find((e) => e.name === 'Bench Press')!;
    const incline = ex.find((e) => e.name === 'Incline Bench')!;
    expect(incline.base_exercise_id).toBe(bench.id);
    expect(bench.brand).toBeNull(); // '' in the source
    expect(incline.created_at.toISOString()).toBe('2026-01-03T10:00:00.000Z');
    expect(incline.updated_at.toISOString()).toBe('2026-01-04T10:00:00.000Z'); // not moved by the updated_at trigger

    // workouts keep their dates and timestamps
    const w = await sql`select name, date, created_at, updated_at, gym, is_template, rating from public.workouts where user_id = ${owner.id} order by date`;
    expect(w.map((r) => r.date.toISOString())).toEqual(['2026-02-01T08:00:00.000Z', '2026-02-03T17:30:00.000Z', '2026-02-08T08:00:00.000Z']);
    expect(w[0].updated_at.toISOString()).toBe('2026-02-01T09:00:00.000Z');
    expect(w[1]).toMatchObject({ gym: null, is_template: true, rating: null });

    // order of logged exercises and sets inside a workout is preserved
    const order = await sql`
      select we.exercise_name, array_agg(s.weight order by s.created_at, s.id) as weights
      from public.workout_exercises we join public.sets s on s.workout_exercise_id = we.id
      join public.workouts wk on wk.id = we.workout_id
      where wk.user_id = ${owner.id} and wk.date = '2026-02-01T08:00:00Z'
      group by we.id, we.exercise_name, we.created_at order by we.created_at`;
    expect(order.map((r) => r.exercise_name)).toEqual(['Bench Press', 'Incline Bench']);
    expect(order[0].weights).toEqual([60, 70, 80]);

    // the profile's empty fields were filled
    const [p] = await sql`select name, age, avatar_url from public.profiles where id = ${owner.id}`;
    expect(p).toMatchObject({ name: 'Alex', age: 31, avatar_url: null });
  });

  it('never overwrites profile fields the user already set', async () => {
    const { owner, source } = await setup('keepprofile');
    await sql`update public.profiles set name = 'Already set', age = 40 where id = ${owner.id}`;
    await importLegacy(source, sql, owner.username, { apply: true });
    const [p] = await sql`select name, age from public.profiles where id = ${owner.id}`;
    expect(p).toMatchObject({ name: 'Already set', age: 40 });
  });

  it('reconciles with no differences', async () => {
    const { owner, source } = await setup('reconcile');
    await importLegacy(source, sql, owner.username, { apply: true });
    const rec = await reconcileLegacy(source, sql, owner.username);
    expect(rec.mismatches).toEqual([]);
    expect(rec.ok).toBe(true);
    expect(rec.checked).toEqual(EXPECTED);
    expect(rec.source.volume).toBe(rec.target.volume);
    expect(rec.source.firstDate).toBe('2026-02-01T08:00:00.000Z');
    expect(rec.source.lastDate).toBe('2026-02-08T08:00:00.000Z');
  });

  it('a second run changes nothing', async () => {
    const { owner, source } = await setup('rerun');
    await importLegacy(source, sql, owner.username, { apply: true });
    const before = await rowCounts(owner.id);

    const again = await importLegacy(source, sql, owner.username, { apply: true });
    expect(again.ok).toBe(true);
    expect(again.created).toEqual({ profile: 0, exercises: 0, workouts: 0, workoutExercises: 0, sets: 0 });
    expect(again.skipped).toEqual({ profile: 1, ...EXPECTED });
    expect(await rowCounts(owner.id)).toEqual(before);
  });
});

describe('interruption and retry', () => {
  it('a failure rolls back only the workout in progress, and a retry completes without duplicates', async () => {
    const { owner, source } = await setup('interrupt');

    await expect(
      importLegacy(source, sql, owner.username, {
        apply: true,
        hooks: {
          afterWorkoutRows: (id) => {
            if (id === FIXTURE_IDS.w2) throw new Error('simulated crash');
          },
        },
      }),
    ).rejects.toThrow(/simulated crash/);

    // the catalogue and the first workout committed; the crashed workout left nothing behind
    const partial = await rowCounts(owner.id);
    expect(partial.exercises).toBe(EXPECTED.exercises);
    expect(partial.workouts).toBe(1);
    expect(partial.workoutExercises).toBe(2); // only workout 1's
    expect(partial.sets).toBe(5);
    const [{ orphans }] = await sql`
      select count(*)::int as orphans from public.workout_exercises we
      where not exists (select 1 from public.legacy_import_map m where m.target_id = we.id and m.collection = 'workout_exercise')
        and we.workout_id in (select id from public.workouts where user_id = ${owner.id})`;
    expect(orphans).toBe(0);
    // ...and every imported row has its mapping
    expect(partial.mappings).toBe(1 + EXPECTED.exercises + 1 + 2 + 5);

    const retry = await importLegacy(source, sql, owner.username, { apply: true });
    expect(retry.ok).toBe(true);
    expect(retry.created.workouts).toBe(2);
    expect(await rowCounts(owner.id)).toMatchObject(EXPECTED);

    expect((await reconcileLegacy(source, sql, owner.username)).mismatches).toEqual([]);
  });

  it('two imports at the same time never duplicate anything', async () => {
    const { owner, source } = await setup('parallel');
    const outcomes = await Promise.allSettled([
      importLegacy(source, sql, owner.username, { apply: true }),
      importLegacy(source, sql, owner.username, { apply: true }),
    ]);
    for (const o of outcomes) {
      if (o.status === 'rejected') expect(String(o.reason)).toMatch(/Another import/);
    }
    expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true);
    expect(await rowCounts(owner.id)).toMatchObject(EXPECTED);

    // whichever one lost can simply be rerun
    await importLegacy(source, sql, owner.username, { apply: true });
    expect(await rowCounts(owner.id)).toMatchObject(EXPECTED);
  });
});

describe('one import of a source at a time', () => {
  it('refuses to run while another import of the same source holds the lock', async () => {
    const { owner, source } = await setup('locked');
    const holder = await sql.reserve();
    try {
      await holder`select pg_advisory_lock(hashtextextended(${source.sourceId}, 0))`;
      await expect(importLegacy(source, sql, owner.username, { apply: true })).rejects.toThrow(/Another import/);
      expect(await rowCounts(owner.id)).toEqual({ exercises: 0, workouts: 0, workoutExercises: 0, sets: 0, mappings: 0 });

      // a different source is not blocked
      const elsewhere = { ...source, sourceId: `${source.sourceId}-other` };
      await expect(importLegacy(elsewhere, sql, owner.username, { apply: false })).resolves.toMatchObject({ ok: true });
    } finally {
      await holder`select pg_advisory_unlock_all()`;
      holder.release();
    }
    // after release it runs normally
    await expect(importLegacy(source, sql, owner.username, { apply: true })).resolves.toMatchObject({ ok: true });
  });
});

describe('problems are reported, not hidden', () => {
  it('a source record that changed after import is reported and not overwritten', async () => {
    const { owner, source } = await setup('changed');
    await importLegacy(source, sql, owner.username, { apply: true });

    const edited = structuredClone(source);
    edited.workouts[0].exercises[0].sets[0].weight = 999;
    const dry = await importLegacy(edited, sql, owner.username, { apply: false });
    expect(dry.ok).toBe(false);
    expect(dry.issues.find((i) => i.level === 'error')?.message).toMatch(/changed since it was imported/);

    const applied = await importLegacy(edited, sql, owner.username, { apply: true });
    expect(applied.ok).toBe(false);
    expect(applied.applied).toBe(false); // refused
    const [{ weight }] = await sql`
      select s.weight from public.sets s join public.workout_exercises we on we.id = s.workout_exercise_id
      join public.workouts w on w.id = we.workout_id where w.user_id = ${owner.id} and w.date = '2026-02-01T08:00:00Z'
      order by we.created_at, s.created_at limit 1`;
    expect(weight).toBe(60);
  });

  it('a record imported for another user is a conflict', async () => {
    const { owner, source } = await setup('first');
    const other = await createUser('second');
    await importLegacy(source, sql, owner.username, { apply: true });

    const report = await importLegacy(source, sql, other.username, { apply: true });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => /different user/.test(i.message))).toBe(true);
    expect(await rowCounts(other.id)).toEqual({ exercises: 0, workouts: 0, workoutExercises: 0, sets: 0, mappings: 0 });
  });

  it('a mapping whose target was deleted is reported', async () => {
    const { owner, source } = await setup('gone');
    await importLegacy(source, sql, owner.username, { apply: true });
    await sql`delete from public.workouts where user_id = ${owner.id} and date = '2026-02-03T17:30:00Z'`;
    const report = await importLegacy(source, sql, owner.username, { apply: false });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => /no longer exists/.test(i.message))).toBe(true);
  });

  it('an orphaned exercise reference blocks the apply; --skip-invalid imports the rest but stays unsuccessful', async () => {
    const { owner, source } = await setup('orphan');
    const broken = structuredClone(source);
    broken.workouts[1].exercises[0].exerciseId = 'f'.repeat(24);

    const dry = await importLegacy(broken, sql, owner.username, { apply: false });
    expect(dry.ok).toBe(false);
    expect(dry.issues.some((i) => /Orphan/.test(i.message))).toBe(true);

    const refused = await importLegacy(broken, sql, owner.username, { apply: true });
    expect(refused.applied).toBe(false);
    expect(await rowCounts(owner.id)).toEqual({ exercises: 0, workouts: 0, workoutExercises: 0, sets: 0, mappings: 0 });

    const partial = await importLegacy(broken, sql, owner.username, { apply: true, allowSkipInvalid: true });
    expect(partial.applied).toBe(true);
    expect(partial.ok).toBe(false);
    expect(partial.created.workouts).toBe(2);
    // the invalid workout was not committed in any form
    const [{ n }] = await sql`select count(*)::int as n from public.workouts where user_id = ${owner.id} and name = 'Leg day'`;
    expect(n).toBe(0);
  });

  it('invalid values are listed', async () => {
    const { owner, source } = await setup('invalid');
    const broken = structuredClone(source);
    broken.workouts[0].exercises[0].sets[0].reps = -3;
    broken.workouts[1].date = 'not a date';
    broken.workouts[2].name = '  ';
    broken.exercises[0].baseExercise = FIXTURE_IDS.incline; // incline -> bench -> ... but incline is its own ancestor via bench? make a cycle:
    broken.exercises[1].baseExercise = FIXTURE_IDS.incline;

    const report = await importLegacy(broken, sql, owner.username, { apply: false });
    const messages = report.issues.filter((i) => i.level === 'error').map((i) => i.message).join('\n');
    expect(messages).toMatch(/Reps is not a non-negative whole number/);
    expect(messages).toMatch(/not a valid time/);
    expect(messages).toMatch(/Workout has no name/);
    expect(messages).toMatch(/cycle/);
    expect(report.ok).toBe(false);
  });
});

describe('reconciliation catches damage', () => {
  it('a changed set, a missing set and a swapped exercise are all found', async () => {
    const { owner, source } = await setup('damage');
    await importLegacy(source, sql, owner.username, { apply: true });

    const sets = await sql<{ id: string }[]>`
      select s.id from public.sets s join public.workout_exercises we on we.id = s.workout_exercise_id
      join public.workouts w on w.id = we.workout_id where w.user_id = ${owner.id} order by w.date, we.created_at, s.created_at`;
    await sql`update public.sets set weight = weight + 2.5 where id = ${sets[0].id}`; // 60 -> 62.5
    await sql`delete from public.sets where id = ${sets[sets.length - 1].id}`;

    const [other] = await sql<{ id: string }[]>`select id from public.exercises where owner_id = ${owner.id} and name = 'Hack Squat'`;
    await sql`
      update public.workout_exercises set exercise_id = ${other.id}
      where id = (select we.id from public.workout_exercises we join public.workouts w on w.id = we.workout_id
                  where w.user_id = ${owner.id} and we.exercise_name = 'Incline Bench')`;

    const rec = await reconcileLegacy(source, sql, owner.username);
    expect(rec.ok).toBe(false);
    const text = rec.mismatches.map((m) => `${m.where}: ${m.message}`).join('\n');
    expect(text).toMatch(/Weight differs/);
    expect(text).toMatch(/Set count differs|Not imported/);
    expect(text).toMatch(/different exercise/);
    expect(text).toMatch(/Total volume differs/);
  });

  it('records that disappeared from the source are reported', async () => {
    const { owner, source } = await setup('vanished');
    await importLegacy(source, sql, owner.username, { apply: true });
    const trimmed = structuredClone(source);
    trimmed.workouts.pop();
    const rec = await reconcileLegacy(trimmed, sql, owner.username);
    expect(rec.ok).toBe(false);
    expect(rec.mismatches.some((m) => /no longer in the source/.test(m.message))).toBe(true);
  });
});
