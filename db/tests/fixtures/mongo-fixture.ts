// A small, deterministic stand-in for the legacy MongoDB data (ids look like ObjectIds).
// Used to test the importer without a Mongo server. It is NOT the real history.
import type { MongoSource } from '../../legacy/source.ts';

const oid = (n: number) => n.toString(16).padStart(24, '0');

export const FIXTURE_IDS = {
  bench: oid(0x101),
  incline: oid(0x102),
  squat: oid(0x103),
  w1: oid(0x201),
  w2: oid(0x202),
  w3: oid(0x203),
};

/** 1 profile, 3 exercises (the variant is listed BEFORE its base on purpose), 3 workouts, 12 sets. */
export function mongoFixture(sourceId: string): MongoSource {
  const ids = FIXTURE_IDS;
  return {
    sourceId,
    profiles: [{ _id: oid(1), name: 'Alex', age: 31, avatarUrl: 'http://localhost:5000/uploads/me.png' }],
    exercises: [
      {
        _id: ids.incline,
        name: 'Incline Bench',
        muscleGroups: ['Chest', 'Shoulders'],
        category: ['Barbell'],
        brand: null,
        baseExercise: ids.bench,
        createdAt: '2026-01-03T10:00:00.000Z',
        updatedAt: '2026-01-04T10:00:00.000Z',
      },
      {
        _id: ids.bench,
        name: 'Bench Press',
        muscleGroups: ['Chest', 'Triceps'],
        category: ['Barbell'],
        brand: '',
        baseExercise: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        _id: ids.squat,
        name: 'Hack Squat',
        muscleGroups: ['Quads'],
        category: ['Machine'],
        brand: 'HOIST',
        baseExercise: null,
        createdAt: '2026-01-02T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
      },
    ],
    workouts: [
      {
        _id: ids.w1,
        name: 'Push day',
        gym: 'Gym A',
        date: '2026-02-01T08:00:00.000Z',
        notes: 'Felt strong',
        rating: 4,
        isTemplate: false,
        durationSeconds: 3600,
        createdAt: '2026-02-01T08:00:00.000Z',
        updatedAt: '2026-02-01T09:00:00.000Z',
        exercises: [
          {
            _id: oid(0x301),
            exerciseId: ids.bench,
            exerciseName: 'Bench Press',
            sets: [
              { _id: oid(0x401), reps: 8, weight: 60 },
              { _id: oid(0x402), reps: 6, weight: 70 },
              { _id: oid(0x403), reps: 4, weight: 80 },
            ],
          },
          {
            _id: oid(0x302),
            exerciseId: ids.incline,
            exerciseName: 'Incline Bench',
            sets: [
              { _id: oid(0x404), reps: 10, weight: 40 },
              { _id: oid(0x405), reps: 9, weight: 40 },
            ],
          },
        ],
      },
      {
        _id: ids.w2,
        name: 'Leg day',
        gym: '',
        date: '2026-02-03T17:30:00.000Z',
        notes: '',
        rating: null,
        isTemplate: true,
        durationSeconds: null,
        createdAt: '2026-02-03T17:30:00.000Z',
        updatedAt: '2026-02-03T17:30:00.000Z',
        exercises: [
          {
            _id: oid(0x303),
            exerciseId: ids.squat,
            exerciseName: 'Hack Squat',
            sets: [
              { _id: oid(0x406), reps: 12, weight: 100.5 },
              { _id: oid(0x407), reps: 10, weight: 120 },
              { _id: oid(0x408), reps: 8, weight: 140 },
            ],
          },
        ],
      },
      {
        _id: ids.w3,
        name: 'Push day',
        gym: 'Gym B',
        date: '2026-02-08T08:00:00.000Z',
        // an old record: no timestamps from the source
        exercises: [
          {
            _id: oid(0x304),
            exerciseId: ids.bench,
            exerciseName: 'Bench Press',
            sets: [
              { _id: oid(0x409), reps: 8, weight: 62.5 },
              { _id: oid(0x40a), reps: 7, weight: 65 },
              { _id: oid(0x40b), reps: 6, weight: 67.5 },
              { _id: oid(0x40c), reps: 0, weight: 0 },
            ],
          },
        ],
      },
    ],
  };
}

export const FIXTURE_TOTALS = { exercises: 3, workouts: 3, workoutExercises: 4, sets: 12 };
