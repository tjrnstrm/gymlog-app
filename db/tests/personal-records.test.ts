// A coach's own history and personal bests must never include their clients' results.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computePersonalBests,
  computePreviousBests,
  getMyWorkout,
  listClientWorkouts,
  listMyWorkouts,
} from '@bro-split/database';
import type { WorkoutLike } from '@bro-split/database';
import { cleanup, createUser, grantCoachPlan, makeSql, seedGlobalExercise, seedTraining, setLink } from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let coach: TestUser;
let client: TestUser;
let exerciseId: string;
let coachWorkoutId: string;
let clientWorkoutId: string;

// The shape the calculation helpers expect (the app maps its records to this; here we map raw rows).
const toLike = (rows: Awaited<ReturnType<typeof listMyWorkouts>>): WorkoutLike[] =>
  rows.map((w) => ({
    _id: w.id,
    date: w.date,
    exercises: w.exercises.map((e) => ({
      exerciseId: e.exercise_id,
      sets: e.sets.map((s) => ({ _id: s.id, reps: s.reps, weight: s.weight })),
    })),
  }));

beforeAll(async () => {
  sql = makeSql();
  coach = await createUser('coach');
  client = await createUser('client');
  await grantCoachPlan(sql, coach.id);
  await setLink(sql, coach.id, client.id, 'accepted');

  exerciseId = await seedGlobalExercise(sql, 'squat');
  // the client lifts MUCH heavier than the coach on the same exercise
  coachWorkoutId = (await seedTraining(sql, coach.id, { exerciseId, weight: 100, reps: 5 })).workoutId;
  clientWorkoutId = (await seedTraining(sql, client.id, { exerciseId, weight: 250, reps: 5 })).workoutId;
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe("a coach's personal queries", () => {
  it("row-level security does let the coach read the client's workout (that is the coaching feature)", async () => {
    const { data } = await coach.client.from('workouts').select('id').eq('id', clientWorkoutId);
    expect(data).toHaveLength(1);
  });

  it("listMyWorkouts returns only the coach's own workouts", async () => {
    const mine = await listMyWorkouts(coach.client);
    expect(mine.map((w) => w.id)).toEqual([coachWorkoutId]);
  });

  it("personal bests are computed from the coach's own lifts only", async () => {
    const history = toLike(await listMyWorkouts(coach.client));
    expect(computePersonalBests(history).get(exerciseId)).toEqual({ reps: 5, weight: 100 });

    // sanity: an unscoped read WOULD have been contaminated by the client's 250
    const { data } = await coach.client.from('workouts').select('id');
    expect(data).toHaveLength(2);
  });

  it('previous-best markers ignore client results too', async () => {
    const history = toLike(await listMyWorkouts(coach.client));
    const current = history.find((w) => w._id === coachWorkoutId)!;
    const { personalBestSetIds, previousBestRepsPerSet } = computePreviousBests(current, history);
    expect(personalBestSetIds.size).toBe(1);
    expect(previousBestRepsPerSet.size).toBe(0);
  });

  it("getMyWorkout refuses a client's workout id", async () => {
    await expect(getMyWorkout(coach.client, clientWorkoutId)).rejects.toBeTruthy();
    await expect(getMyWorkout(coach.client, coachWorkoutId)).resolves.toMatchObject({ id: coachWorkoutId });
  });

  it('the client sees only their own history too', async () => {
    expect((await listMyWorkouts(client.client)).map((w) => w.id)).toEqual([clientWorkoutId]);
  });
});

describe('explicit coach access to one client', () => {
  it("listClientWorkouts returns the chosen client's workouts while the relationship is active", async () => {
    const rows = await listClientWorkouts(coach.client, client.id);
    expect(rows.map((w) => w.id)).toEqual([clientWorkoutId]);
  });

  it('returns nothing once the relationship has ended', async () => {
    await setLink(sql, coach.id, client.id, 'ended');
    expect(await listClientWorkouts(coach.client, client.id)).toEqual([]);
    await setLink(sql, coach.id, client.id, 'accepted');
  });

  it('rejects ids that are not UUIDs before querying', async () => {
    await expect(listClientWorkouts(coach.client, 'x,or(user_id.neq.0)')).rejects.toThrow(/Invalid/);
  });
});
