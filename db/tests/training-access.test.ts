// Who can read and change a client's training data? Roles x resources x operations.
//
// Roles (each acts through an ordinary signed-in client):
//   owner          the client themselves
//   accepted       coach with an active plan and an accepted link          -> read-only access
//   adminCoach     admin who is also an accepted, active coach             -> same as an accepted coach
//   pending        coach with a plan, link still pending
//   declined       coach with a plan, client declined
//   cancelled      coach with a plan, coach withdrew the invite
//   ended          coach with a plan, relationship ended
//   revoked        accepted link but the coach plan was removed
//   expired        accepted link but the coach plan has expired
//   unrelated      ordinary user
//   adminOnly      admin, no link, no plan -> admin status grants no training access
//   anonymous      no session
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createUser,
  grantCoachPlan,
  makeAdmin,
  makeSql,
  seedTraining,
  setLink,
} from './helpers/world.ts';
import type { Client, SeededTraining, Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let owner: TestUser;
let seeded: SeededTraining;
const roles: Record<string, { user: TestUser; canRead: boolean }> = {};

beforeAll(async () => {
  sql = makeSql();
  owner = await createUser('owner');
  seeded = await seedTraining(sql, owner.id, { weight: 150, reps: 3 });

  const add = async (name: string, canRead: boolean, setup: (u: TestUser) => Promise<void>) => {
    const user = await createUser(name);
    await setup(user);
    roles[name] = { user, canRead };
  };

  await add('accepted', true, async (u) => {
    await grantCoachPlan(sql, u.id);
    await setLink(sql, u.id, owner.id, 'accepted');
  });
  await add('adminCoach', true, async (u) => {
    await makeAdmin(sql, u.id);
    await grantCoachPlan(sql, u.id);
    await setLink(sql, u.id, owner.id, 'accepted');
  });
  for (const status of ['pending', 'declined', 'cancelled', 'ended'] as const) {
    await add(status, false, async (u) => {
      await grantCoachPlan(sql, u.id);
      await setLink(sql, u.id, owner.id, status);
    });
  }
  await add('revoked', false, async (u) => {
    await setLink(sql, u.id, owner.id, 'accepted'); // no plan row at all
  });
  await add('expired', false, async (u) => {
    await grantCoachPlan(sql, u.id, { expired: true });
    await setLink(sql, u.id, owner.id, 'accepted');
  });
  await add('unrelated', false, async () => {});
  await add('adminOnly', false, async (u) => {
    await makeAdmin(sql, u.id);
  });
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

const readers = ['accepted', 'adminCoach'];
const nonReaders = ['pending', 'declined', 'cancelled', 'ended', 'revoked', 'expired', 'unrelated', 'adminOnly'];

async function count(client: Client, table: 'workouts' | 'workout_exercises' | 'sets' | 'profiles' | 'exercises', column: string, value: string) {
  const { data, error } = await client.from(table).select('id').eq(column, value);
  expect(error).toBeNull();
  return data?.length ?? 0;
}

describe('reading the client\'s training data', () => {
  const resources = [
    ['workouts', 'id', () => seeded.workoutId],
    ['workout_exercises', 'id', () => seeded.workoutExerciseId],
    ['sets', 'id', () => seeded.setId],
    ['profiles', 'id', () => owner.id],
    ['exercises', 'id', () => seeded.exerciseId], // the client's private exercise
  ] as const;

  for (const [table, column, id] of resources) {
    it(`the owner reads their own ${table}`, async () => {
      expect(await count(owner.client, table, column, id())).toBe(1);
    });

    for (const role of readers) {
      it(`${role} reads the client's ${table}`, async () => {
        expect(await count(roles[role].user.client, table, column, id())).toBe(1);
      });
    }

    for (const role of nonReaders) {
      it(`${role} sees none of the client's ${table}`, async () => {
        expect(await count(roles[role].user.client, table, column, id())).toBe(0);
      });
    }

    it(`an anonymous caller gets none of the ${table}`, async () => {
      const { data, error } = await anonClient().from(table).select('id').eq(column, id());
      // Signed-out callers have no table privileges at all: an error, never rows.
      expect(error).not.toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  }
});

describe('writing to the client\'s training data', () => {
  const everyoneElse = [...readers, ...nonReaders];

  for (const role of everyoneElse) {
    describe(role, () => {
      it('cannot insert a workout, exercise or set for the client', async () => {
        const c = roles[role].user.client;
        const w = await c.from('workouts').insert({ user_id: owner.id, name: 'forged', date: new Date().toISOString() });
        expect(w.error).not.toBeNull();
        const we = await c
          .from('workout_exercises')
          .insert({ workout_id: seeded.workoutId, exercise_id: seeded.exerciseId, exercise_name: 'forged' });
        expect(we.error).not.toBeNull();
        const s = await c.from('sets').insert({ workout_exercise_id: seeded.workoutExerciseId, reps: 1, weight: 1 });
        expect(s.error).not.toBeNull();
      });

      it('cannot update or delete the client\'s workout, exercise or sets', async () => {
        const c = roles[role].user.client;
        await c.from('sets').update({ weight: 999 }).eq('id', seeded.setId);
        await c.from('sets').delete().eq('id', seeded.setId);
        await c.from('workout_exercises').update({ exercise_name: 'x' }).eq('id', seeded.workoutExerciseId);
        await c.from('workout_exercises').delete().eq('id', seeded.workoutExerciseId);
        await c.from('workouts').update({ name: 'hijacked' }).eq('id', seeded.workoutId);
        await c.from('workouts').delete().eq('id', seeded.workoutId);
        await c.from('exercises').update({ name: 'hijacked' }).eq('id', seeded.exerciseId);
        await c.from('exercises').delete().eq('id', seeded.exerciseId);
        await c.from('profiles').update({ name: 'hijacked' }).eq('id', owner.id);

        // Row-level security turns these into no-ops; check the data really is untouched.
        const [set] = await sql`select weight, reps from public.sets where id = ${seeded.setId}`;
        expect(set).toMatchObject({ weight: 150, reps: 3 });
        const [we] = await sql`select exercise_name from public.workout_exercises where id = ${seeded.workoutExerciseId}`;
        expect(we.exercise_name).not.toBe('x');
        const [w] = await sql`select name from public.workouts where id = ${seeded.workoutId}`;
        expect(w.name).toBe('Test workout');
        const [e] = await sql`select name from public.exercises where id = ${seeded.exerciseId}`;
        expect(e.name).not.toBe('hijacked');
        const [p] = await sql`select name from public.profiles where id = ${owner.id}`;
        expect(p.name).not.toBe('hijacked');
      });
    });
  }

  it('anonymous callers cannot write anything', async () => {
    const anon = anonClient();
    expect((await anon.from('workouts').insert({ user_id: owner.id, name: 'x', date: new Date().toISOString() })).error).not.toBeNull();
    expect((await anon.from('sets').update({ weight: 1 }).eq('id', seeded.setId)).error).not.toBeNull();
    expect((await anon.from('workouts').delete().eq('id', seeded.workoutId)).error).not.toBeNull();
  });

  it('the owner can change their own data', async () => {
    const upd = await owner.client.from('sets').update({ weight: 155 }).eq('id', seeded.setId).select('weight');
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([{ weight: 155 }]);
    await owner.client.from('sets').update({ weight: 150 }).eq('id', seeded.setId);

    const ins = await owner.client.from('sets').insert({ workout_exercise_id: seeded.workoutExerciseId, reps: 2, weight: 10 }).select('id');
    expect(ins.error).toBeNull();
    const del = await owner.client.from('sets').delete().eq('id', ins.data![0].id).select('id');
    expect(del.data).toHaveLength(1);
  });
});

describe('invalid values', () => {
  it('rejects negative reps and weight', async () => {
    const reps = await owner.client.from('sets').insert({ workout_exercise_id: seeded.workoutExerciseId, reps: -1, weight: 0 });
    expect(reps.error?.message).toMatch(/sets_reps_nonnegative/);
    const weight = await owner.client.from('sets').insert({ workout_exercise_id: seeded.workoutExerciseId, reps: 1, weight: -5 });
    expect(weight.error?.message).toMatch(/sets_weight_nonnegative/);
  });
});

describe('profile privileges', () => {
  it('a user cannot make themselves an admin', async () => {
    const { error } = await roles.unrelated.user.client.from('profiles').update({ is_admin: true }).eq('id', roles.unrelated.user.id);
    expect(error).not.toBeNull();
    const [p] = await sql`select is_admin from public.profiles where id = ${roles.unrelated.user.id}`;
    expect(p.is_admin).toBe(false);
  });

  it('a user cannot insert or delete profiles through the API', async () => {
    const c = roles.unrelated.user.client;
    expect((await c.from('profiles').insert({ id: crypto.randomUUID() })).error).not.toBeNull();
    await c.from('profiles').delete().eq('id', roles.unrelated.user.id);
    const [{ n }] = await sql`select count(*)::int as n from public.profiles where id = ${roles.unrelated.user.id}`;
    expect(n).toBe(1);
  });
});
