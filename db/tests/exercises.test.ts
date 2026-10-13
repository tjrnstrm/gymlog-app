// Exercise ownership: a global catalogue (admin-managed) plus private entries.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMyCatalogExercises, resolveProgramExercises } from '@bro-split/database';
import {
  cleanup,
  createUser,
  grantCoachPlan,
  makeAdmin,
  makeSql,
  runId,
  seedGlobalExercise,
  seedTraining,
  setLink,
  adminApi,
} from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let alice: TestUser; // ordinary user
let bob: TestUser; // ordinary user
let admin: TestUser;
let coach: TestUser; // accepted, active coach of alice
let globalId: string;

beforeAll(async () => {
  sql = makeSql();
  alice = await createUser('alice');
  bob = await createUser('bob');
  admin = await createUser('admin');
  coach = await createUser('coach');
  await makeAdmin(sql, admin.id);
  await grantCoachPlan(sql, coach.id);
  await setLink(sql, coach.id, alice.id, 'accepted');
  globalId = await seedGlobalExercise(sql, 'bench');
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe('creating exercises', () => {
  it('a private exercise is owned by the signed-in user', async () => {
    const { data, error } = await alice.client
      .from('exercises')
      .insert({ name: `T${runId} mine` })
      .select('owner_id, is_global')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ owner_id: alice.id, is_global: false });
  });

  it('cannot create a global exercise directly', async () => {
    const { error } = await alice.client.from('exercises').insert({ name: `T${runId} fake global`, is_global: true, owner_id: null });
    expect(error).not.toBeNull();
  });

  it('cannot create an exercise owned by somebody else', async () => {
    const { error } = await alice.client.from('exercises').insert({ name: `T${runId} forged`, owner_id: bob.id });
    expect(error).not.toBeNull();
  });

  it('even an admin cannot insert a global row directly (they use the function)', async () => {
    const { error } = await admin.client.from('exercises').insert({ name: `T${runId} direct`, is_global: true, owner_id: null });
    expect(error).not.toBeNull();
  });

  it('admin_create_global_exercise works for admins and fails for everyone else', async () => {
    const ok = await admin.client.rpc('admin_create_global_exercise', { p_name: `T${runId} catalogue`, p_brand: 'HOIST' });
    expect(ok.error).toBeNull();
    const [row] = await sql`select is_global, owner_id, brand from public.exercises where id = ${ok.data as string}`;
    expect(row).toMatchObject({ is_global: true, owner_id: null, brand: 'HOIST' });

    const denied = await alice.client.rpc('admin_create_global_exercise', { p_name: `T${runId} nope` });
    expect(denied.error?.message).toMatch(/Admins only/);
    const coachDenied = await coach.client.rpc('admin_create_global_exercise', { p_name: `T${runId} nope` });
    expect(coachDenied.error?.message).toMatch(/Admins only/);
  });
});

describe('who can read an exercise', () => {
  it('everyone signed in reads global exercises', async () => {
    for (const user of [alice, bob, admin, coach]) {
      const { data } = await user.client.from('exercises').select('id').eq('id', globalId);
      expect(data).toHaveLength(1);
    }
  });

  it('private exercises are visible to their owner only', async () => {
    const t = await seedTraining(sql, alice.id);
    expect((await alice.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(1);
    expect((await bob.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(0);
    expect((await admin.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(0);
  });

  it('a coach reads the exercise behind an accepted client\'s workout, and stops when it ends', async () => {
    const t = await seedTraining(sql, alice.id);
    expect((await coach.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(1);
    await setLink(sql, coach.id, alice.id, 'ended');
    expect((await coach.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(0);
    await setLink(sql, coach.id, alice.id, 'accepted');
  });

  it('listMyCatalogExercises returns global + own entries and never a client\'s private one', async () => {
    const t = await seedTraining(sql, alice.id, { exerciseName: `T${runId} alice secret` });
    const mine = await listMyCatalogExercises(coach.client);
    const ids = mine.map((e) => e.id);
    expect(ids).toContain(globalId);
    expect(ids).not.toContain(t.exerciseId);
    // ...even though row-level security does let the coach read it
    expect((await coach.client.from('exercises').select('id').eq('id', t.exerciseId)).data).toHaveLength(1);

    // and therefore programme-name matching can never pick the client's private entry
    const resolved = resolveProgramExercises([`T${runId} alice secret`], mine.map((e) => ({ id: e.id, name: e.name })));
    expect([...resolved.values()]).toEqual([{ kind: 'create' }]);
  });
});

describe('who can change an exercise', () => {
  it('the owner edits and deletes their own private exercise', async () => {
    const { data: created } = await alice.client.from('exercises').insert({ name: `T${runId} edit me` }).select('id').single();
    const id = created!.id;
    const upd = await alice.client.from('exercises').update({ name: `T${runId} edited`, brand: 'Cybex' }).eq('id', id).select('name');
    expect(upd.data).toEqual([{ name: `T${runId} edited` }]);
    const del = await alice.client.from('exercises').delete().eq('id', id).select('id');
    expect(del.data).toHaveLength(1);
  });

  it('other users cannot edit or delete it', async () => {
    const { data: created } = await alice.client.from('exercises').insert({ name: `T${runId} protected` }).select('id').single();
    const id = created!.id;
    for (const other of [bob, admin, coach]) {
      await other.client.from('exercises').update({ name: 'hijacked' }).eq('id', id);
      await other.client.from('exercises').delete().eq('id', id);
    }
    const [row] = await sql`select name from public.exercises where id = ${id}`;
    expect(row.name).toBe(`T${runId} protected`);
  });

  it('nobody can change owner_id or is_global (no promotion to global)', async () => {
    const { data: created } = await alice.client.from('exercises').insert({ name: `T${runId} promote` }).select('id').single();
    const id = created!.id;
    expect((await alice.client.from('exercises').update({ is_global: true, owner_id: null }).eq('id', id)).error).not.toBeNull();
    expect((await alice.client.from('exercises').update({ owner_id: bob.id }).eq('id', id)).error).not.toBeNull();
    expect((await admin.client.from('exercises').update({ is_global: true, owner_id: null }).eq('id', id)).error).not.toBeNull();
    const [row] = await sql`select owner_id, is_global from public.exercises where id = ${id}`;
    expect(row).toMatchObject({ owner_id: alice.id, is_global: false });
  });

  it('admins change and delete global exercises; ordinary users cannot', async () => {
    const gid = await seedGlobalExercise(sql, 'admin-managed');
    await alice.client.from('exercises').update({ name: 'hijacked' }).eq('id', gid);
    await alice.client.from('exercises').delete().eq('id', gid);
    await coach.client.from('exercises').update({ name: 'hijacked' }).eq('id', gid);
    let [row] = await sql`select name from public.exercises where id = ${gid}`;
    expect(row.name).not.toBe('hijacked');

    const upd = await admin.client.from('exercises').update({ muscle_groups: ['Chest'] }).eq('id', gid).select('muscle_groups');
    expect(upd.data).toEqual([{ muscle_groups: ['Chest'] }]);
    const del = await admin.client.from('exercises').delete().eq('id', gid).select('id');
    expect(del.data).toHaveLength(1);
    [row] = await sql`select name from public.exercises where id = ${gid}`.then((r) => (r.length ? r : [{ name: null }]));
    expect(row.name).toBeNull();
  });

  it('cannot delete an exercise that a workout still uses', async () => {
    const t = await seedTraining(sql, alice.id);
    const { error } = await alice.client.from('exercises').delete().eq('id', t.exerciseId);
    expect(error).not.toBeNull();
    const [{ n }] = await sql`select count(*)::int as n from public.exercises where id = ${t.exerciseId}`;
    expect(n).toBe(1);
  });
});

describe('base exercise rule', () => {
  it('may point at a global exercise or at your own', async () => {
    const own = await alice.client.from('exercises').insert({ name: `T${runId} base own` }).select('id').single();
    const onGlobal = await alice.client.from('exercises').insert({ name: `T${runId} variant 1`, base_exercise_id: globalId });
    expect(onGlobal.error).toBeNull();
    const onOwn = await alice.client.from('exercises').insert({ name: `T${runId} variant 2`, base_exercise_id: own.data!.id });
    expect(onOwn.error).toBeNull();
  });

  it('may not point at somebody else\'s private exercise', async () => {
    const theirs = await bob.client.from('exercises').insert({ name: `T${runId} bobs` }).select('id').single();
    const insert = await alice.client.from('exercises').insert({ name: `T${runId} variant 3`, base_exercise_id: theirs.data!.id });
    expect(insert.error?.message).toMatch(/base exercise/i);

    const mine = await alice.client.from('exercises').insert({ name: `T${runId} variant 4` }).select('id').single();
    const update = await alice.client.from('exercises').update({ base_exercise_id: theirs.data!.id }).eq('id', mine.data!.id);
    expect(update.error?.message).toMatch(/base exercise/i);
  });
});

describe('attaching exercises to workouts', () => {
  it('you can use global exercises and your own', async () => {
    const w = await alice.client.from('workouts').insert({ name: 'ok', date: new Date().toISOString() }).select('id').single();
    const own = await alice.client.from('exercises').insert({ name: `T${runId} own for workout` }).select('id').single();
    for (const exerciseId of [globalId, own.data!.id]) {
      const { error } = await alice.client.from('workout_exercises').insert({ workout_id: w.data!.id, exercise_id: exerciseId, exercise_name: 'x' });
      expect(error).toBeNull();
    }
  });

  it('a coach who can read a client\'s private exercise cannot attach it to their own workout', async () => {
    const t = await seedTraining(sql, alice.id);
    const w = await coach.client.from('workouts').insert({ name: 'coach own', date: new Date().toISOString() }).select('id').single();

    const insert = await coach.client.from('workout_exercises').insert({ workout_id: w.data!.id, exercise_id: t.exerciseId, exercise_name: 'x' });
    expect(insert.error?.message).toMatch(/not available/);

    // ...nor by moving an existing row to it
    const own = await coach.client.from('exercises').insert({ name: `T${runId} coach own` }).select('id').single();
    const row = await coach.client.from('workout_exercises').insert({ workout_id: w.data!.id, exercise_id: own.data!.id, exercise_name: 'x' }).select('id').single();
    const update = await coach.client.from('workout_exercises').update({ exercise_id: t.exerciseId }).eq('id', row.data!.id);
    expect(update.error?.message).toMatch(/not available/);

    // ...and not after the relationship has ended either (the id is still known)
    await setLink(sql, coach.id, alice.id, 'ended');
    const afterEnd = await coach.client.from('workout_exercises').insert({ workout_id: w.data!.id, exercise_id: t.exerciseId, exercise_name: 'x' });
    expect(afterEnd.error).not.toBeNull();
    await setLink(sql, coach.id, alice.id, 'accepted');
  });

  it('moving a logged exercise into somebody else\'s workout is refused', async () => {
    const mine = await seedTraining(sql, alice.id);
    const theirs = await seedTraining(sql, bob.id);
    const { error } = await sql`update public.workout_exercises set workout_id = ${theirs.workoutId} where id = ${mine.workoutExerciseId}`
      .then(() => ({ error: null }))
      .catch((e: Error) => ({ error: e }));
    expect(error?.message).toMatch(/not available/);
  });
});

describe('deleting a user', () => {
  it('works even when their private exercises are used in their own workouts', async () => {
    const victim = await createUser('victim');
    await seedTraining(sql, victim.id);
    await seedTraining(sql, victim.id);
    const { error } = await adminApi().auth.admin.deleteUser(victim.id);
    expect(error).toBeNull();
    const [{ n }] = await sql`select count(*)::int as n from public.exercises where owner_id = ${victim.id}`;
    expect(n).toBe(0);
  });
});
