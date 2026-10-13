import { useMemo, useState } from 'react';
import { periodTotals, previousTotals, setsByMuscle, volumeSeries } from '@bro-split/database';
import type { VolumePeriod } from '@bro-split/database';
import { useExercises } from '../hooks/useExercises';
import { useWorkouts } from '../hooks/useWorkouts';

const PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: 28, label: '4 weeks' },
  { value: 84, label: '12 weeks' },
  { value: 0, label: 'All time' },
];

const tonnes = (kg: number) => (kg / 1000).toFixed(kg < 100_000 ? 1 : 0);

/** How much you have lifted: the total, the trend by week (or month) and sets per muscle group. */
export default function Volume() {
  const { workouts, loading } = useWorkouts();
  const { exercises } = useExercises();
  const [period, setPeriod] = useState<VolumePeriod>(28);
  const now = useMemo(() => new Date(), []);

  const totals = useMemo(() => periodTotals(workouts, now, period), [workouts, now, period]);
  const previous = useMemo(() => previousTotals(workouts, now, period), [workouts, now, period]);
  const bars = useMemo(() => volumeSeries(workouts, now, period), [workouts, now, period]);
  const muscles = useMemo(
    () =>
      setsByMuscle(
        workouts,
        new Map(exercises.map((e) => [e._id, e.muscleGroups])),
        now,
        period,
      ).slice(0, 8),
    [workouts, exercises, now, period],
  );

  const tallest = Math.max(...bars.map((b) => b.volume), 1);
  const mostSets = Math.max(...muscles.map((m) => m.sets), 1);
  const change =
    previous && previous.volume > 0 ? Math.round(((totals.volume - previous.volume) / previous.volume) * 100) : null;

  return (
    <div className="volume">
      <h1 className="volume__title">Volume</h1>

      <div className="period-toggle" role="group" aria-label="Period">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === period ? 'period-toggle__on' : ''}
            aria-pressed={option.value === period}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : workouts.length === 0 ? (
        <p className="muted">Log a workout and your volume shows up here.</p>
      ) : (
        <>
          <div className="volume__total">
            <span className="volume__number">
              {tonnes(totals.volume)}
              <small>t</small>
            </span>
            <span className="muted">
              {totals.workouts} {totals.workouts === 1 ? 'workout' : 'workouts'} · {totals.sets} sets
              {change !== null && ` · ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the ${period === 28 ? 'four' : 'twelve'} weeks before`}
            </span>
          </div>

          <section className="volume__section" aria-label={period === 0 ? 'Volume by month' : 'Volume by week'}>
            <h2 className="eyebrow">{period === 0 ? 'Last 12 months' : 'By week'}</h2>
            <div className="volume-bars">
              {bars.map((bar) => (
                <div key={bar.title} className="volume-bars__col" title={`${bar.title}: ${tonnes(bar.volume)} t`}>
                  <i style={{ height: `${Math.max(2, (100 * bar.volume) / tallest)}%`, opacity: bar.volume === 0 ? 0.2 : 1 }} />
                  <small>{bar.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="volume__section" aria-label="Sets per muscle group">
            <h2 className="eyebrow">Sets per muscle group</h2>
            {muscles.length === 0 ? (
              <p className="muted">Exercises without muscle groups are left out.</p>
            ) : (
              <div className="muscle-rows">
                {muscles.map((m) => (
                  <div key={m.muscle} className="muscle-row">
                    <span>{m.muscle}</span>
                    <span className="muscle-row__bar">
                      <i style={{ width: `${(100 * m.sets) / mostSets}%` }} />
                    </span>
                    <span className="muscle-row__n">{m.sets}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
