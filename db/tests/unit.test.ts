// Pure functions of @bro-split/database (no database needed).
import { describe, expect, it } from 'vitest';
import {
  computePersonalBests,
  computePreviousBests,
  normalizeExerciseName,
  periodTotals,
  previousTotals,
  resolveExerciseName,
  resolveProgramExercises,
  setsByMuscle,
  startOfWeek,
  volumeSeries,
  workoutVolume,
} from '@bro-split/database';
import type { WorkoutLike } from '@bro-split/database';

const workout = (id: string, date: string, exerciseId: string, sets: [string, number, number][]): WorkoutLike => ({
  _id: id,
  date,
  exercises: [{ exerciseId, sets: sets.map(([sid, reps, weight]) => ({ _id: sid, reps, weight })) }],
});

describe('computePersonalBests', () => {
  it('keeps the heaviest set per exercise, more reps winning a tie', () => {
    const pbs = computePersonalBests([
      workout('w1', '2026-01-01', 'bench', [['a', 8, 60], ['b', 5, 80]]),
      workout('w2', '2026-01-08', 'bench', [['c', 6, 80], ['d', 12, 50]]),
      workout('w3', '2026-01-09', 'squat', [['e', 3, 120]]),
    ]);
    expect(pbs.get('bench')).toEqual({ reps: 6, weight: 80 });
    expect(pbs.get('squat')).toEqual({ reps: 3, weight: 120 });
    expect(pbs.size).toBe(2);
  });

  it('is empty without history', () => {
    expect(computePersonalBests([]).size).toBe(0);
  });
});

describe('computePreviousBests', () => {
  const history = [
    workout('w1', '2026-01-01', 'bench', [['a', 8, 60]]),
    workout('w2', '2026-01-08', 'bench', [['b', 10, 60]]),
    workout('w3', '2026-01-15', 'bench', [['c', 9, 60], ['d', 12, 60], ['e', 5, 70]]),
  ];

  it('flags new rep records at a weight and reports the previous best', () => {
    const { personalBestSetIds, previousBestRepsPerSet } = computePreviousBests(history[2], history);
    // before w3 the best at 60 kg was 10 reps: 9 is not a record, 12 is; 70 kg is new
    expect([...personalBestSetIds].sort()).toEqual(['d', 'e']);
    expect(previousBestRepsPerSet.get('c')).toBe(10);
    expect(previousBestRepsPerSet.get('d')).toBe(10);
    expect(previousBestRepsPerSet.has('e')).toBe(false);
  });

  it('does not count the workout against itself and handles history in any order', () => {
    const shuffled = [history[2], history[0], history[1]];
    const a = computePreviousBests(history[2], history);
    const b = computePreviousBests(history[2], shuffled);
    expect([...b.personalBestSetIds].sort()).toEqual([...a.personalBestSetIds].sort());
  });
});

describe('programme name matching', () => {
  const catalog = [
    { id: '1', name: 'Bench Press', isGlobal: true },
    { id: '2', name: '  bench   press ', isGlobal: false },
    { id: '3', name: 'Squat' },
  ];

  it('normalises case and whitespace', () => {
    expect(normalizeExerciseName('  Bench   PRESS ')).toBe('bench press');
  });

  it('reuses a unique match', () => {
    expect(resolveExerciseName('SQUAT', catalog)).toEqual({ kind: 'match', exerciseId: '3' });
  });

  it('never guesses between several matches', () => {
    const r = resolveExerciseName('bench press', catalog);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.options.map((o) => o.id)).toEqual(['1', '2']);
  });

  it('asks for a new private entry when nothing matches', () => {
    expect(resolveExerciseName('Deadlift', catalog)).toEqual({ kind: 'create' });
  });

  it('resolves each distinct name once', () => {
    const map = resolveProgramExercises(['Squat', 'squat ', 'Deadlift'], catalog);
    expect([...map.keys()]).toEqual(['squat', 'deadlift']);
  });
});

describe('volume', () => {
  // Wednesday 14 Oct 2026
  const now = new Date(2026, 9, 14, 12);
  const w = (y: number, m: number, d: number, sets: [number, number][], exerciseId = 'bench') => ({
    date: new Date(y, m, d, 9).toISOString(),
    exercises: [{ exerciseId, sets: sets.map(([reps, weight]) => ({ reps, weight })) }],
  });
  const history = [
    w(2026, 9, 13, [[5, 100], [5, 100]]), // Mon this week: 1000 kg
    w(2026, 9, 8, [[10, 50]]), // last week: 500 kg
    w(2026, 8, 20, [[8, 60]], 'row'), // ~3.5 weeks ago: 480 kg
    w(2026, 7, 1, [[10, 20]]), // ~10 weeks ago: 200 kg
    w(2026, 0, 5, [[10, 20]]), // old
  ];

  it('workout volume is reps x weight over every set', () => {
    expect(workoutVolume(history[0])).toBe(1000);
  });

  it('totals the period and compares with the one before', () => {
    // four calendar weeks start on Mon 21 Sep, so Sunday 20 Sep belongs to the period before
    expect(periodTotals(history, now, 28)).toEqual({ workouts: 2, volume: 1500, sets: 3 });
    expect(periodTotals(history, now, 84).workouts).toBe(4);
    expect(periodTotals(history, now, 0).workouts).toBe(5);
    expect(previousTotals(history, now, 28)).toEqual({ workouts: 1, volume: 480, sets: 1 });
    expect(previousTotals(history, now, 84)?.workouts).toBe(0);
    expect(previousTotals(history, now, 0)).toBeNull();
  });

  it('weeks start on Monday', () => {
    expect(startOfWeek(now).getDate()).toBe(12);
    expect(startOfWeek(new Date(2026, 9, 18)).getDate()).toBe(12); // a Sunday belongs to the week before
  });

  it('builds weekly bars, oldest first, current week last', () => {
    const bars = volumeSeries(history, now, 28);
    expect(bars).toHaveLength(4);
    expect(bars[3].volume).toBe(1000);
    expect(bars[2].volume).toBe(500);
    // the bars add up to the period total
    expect(bars.map((b) => b.volume).reduce((a, b) => a + b, 0)).toBe(periodTotals(history, now, 28).volume);
    expect(volumeSeries(history, now, 84)).toHaveLength(12);
  });

  it('builds twelve monthly bars for all time', () => {
    const bars = volumeSeries(history, now, 0);
    expect(bars).toHaveLength(12);
    expect(bars[11].label).toBe('Oct');
    expect(bars[11].volume).toBe(1500);
    expect(bars[10].volume).toBe(480); // September
  });

  it('counts sets for each muscle group an exercise lists', () => {
    const groups = new Map([['bench', ['Chest', 'Triceps']], ['row', ['Lats']]]);
    expect(setsByMuscle(history, groups, now, 28)).toEqual([
      { muscle: 'Chest', sets: 3 },
      { muscle: 'Triceps', sets: 3 },
    ]);
    expect(setsByMuscle(history, groups, now, 84).find((m) => m.muscle === 'Lats')?.sets).toBe(1);
    expect(setsByMuscle(history, new Map(), now, 28)).toEqual([]);
  });
});
