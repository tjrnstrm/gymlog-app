// Training volume over time, from a user's own workouts. Pure functions: pass the history of the
// signed-in user (listMyWorkouts), never everything row-level security lets a coach read.

export interface VolumeSource {
  date: string;
  exercises: { exerciseId: string; sets: { reps: number; weight: number }[] }[];
}

/** Reps x weight, summed over every set. Kilograms. */
export function workoutVolume(workout: VolumeSource): number {
  return workout.exercises.reduce((n, ex) => n + ex.sets.reduce((m, s) => m + s.reps * s.weight, 0), 0);
}

export const workoutSetCount = (workout: VolumeSource): number =>
  workout.exercises.reduce((n, ex) => n + ex.sets.length, 0);

/** Monday 00:00 of the week containing `d`, local time. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/**
 * 28 = the last four calendar weeks (this week and the three before it), 84 = twelve weeks, 0 = all
 * time. Weeks start on Monday. Totals and the weekly bars use the same weeks, so they always agree.
 */
export type VolumePeriod = 28 | 84 | 0;

/** The Monday on which a period starts (null for all time). */
function periodStart(now: Date, period: VolumePeriod): Date | null {
  if (period === 0) return null;
  const start = startOfWeek(now);
  start.setDate(start.getDate() - (period / 7 - 1) * 7);
  return start;
}

export interface PeriodTotals {
  workouts: number;
  /** Kilograms. */
  volume: number;
  sets: number;
}

function totalsFor(workouts: VolumeSource[]): PeriodTotals {
  return {
    workouts: workouts.length,
    volume: workouts.reduce((n, w) => n + workoutVolume(w), 0),
    sets: workouts.reduce((n, w) => n + workoutSetCount(w), 0),
  };
}

export function periodTotals(workouts: readonly VolumeSource[], now: Date, period: VolumePeriod): PeriodTotals {
  const start = periodStart(now, period);
  return totalsFor(workouts.filter((w) => start === null || new Date(w.date) >= start));
}

/** The period of the same length just before this one, for "up 12% on the previous 4 weeks". Null for all time. */
export function previousTotals(workouts: readonly VolumeSource[], now: Date, period: VolumePeriod): PeriodTotals | null {
  const start = periodStart(now, period);
  if (start === null) return null;
  const before = new Date(start);
  before.setDate(before.getDate() - period);
  return totalsFor(
    workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= before && d < start;
    }),
  );
}

export interface VolumeBar {
  /** Short label under the bar: the Monday's day of month for weeks, the month name for months. */
  label: string;
  /** Full description for assistive technology. */
  title: string;
  /** Kilograms. */
  volume: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Weekly bars for 4 and 12 weeks, the last twelve months for all time. Oldest first, current period last. */
export function volumeSeries(workouts: readonly VolumeSource[], now: Date, period: VolumePeriod): VolumeBar[] {
  if (period === 0) {
    const bars: VolumeBar[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bars.push({ label: MONTHS[month.getMonth()], title: `${MONTHS[month.getMonth()]} ${month.getFullYear()}`, volume: 0 });
      const key = month.getFullYear() * 12 + month.getMonth();
      bars[bars.length - 1].volume = workouts
        .filter((w) => {
          const d = new Date(w.date);
          return d.getFullYear() * 12 + d.getMonth() === key;
        })
        .reduce((n, w) => n + workoutVolume(w), 0);
    }
    return bars;
  }

  const weeks = period / 7;
  const thisWeek = startOfWeek(now);
  const bars: VolumeBar[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    bars.push({
      label: String(start.getDate()),
      title: `Week of ${start.getDate()} ${MONTHS[start.getMonth()]}`,
      volume: workouts
        .filter((w) => {
          const d = new Date(w.date);
          return d >= start && d < end;
        })
        .reduce((n, w) => n + workoutVolume(w), 0),
    });
  }
  return bars;
}

/**
 * Sets per muscle group over the period. An exercise counts for every group it lists, so the numbers
 * show how often each area was trained, not a split of the total.
 */
export function setsByMuscle(
  workouts: readonly VolumeSource[],
  muscleGroupsByExercise: ReadonlyMap<string, readonly string[]>,
  now: Date,
  period: VolumePeriod,
): { muscle: string; sets: number }[] {
  const counts = new Map<string, number>();
  const start = periodStart(now, period);
  for (const w of workouts) {
    if (start !== null && new Date(w.date) < start) continue;
    for (const ex of w.exercises) {
      for (const muscle of muscleGroupsByExercise.get(ex.exerciseId) ?? []) {
        counts.set(muscle, (counts.get(muscle) ?? 0) + ex.sets.length);
      }
    }
  }
  return [...counts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}
