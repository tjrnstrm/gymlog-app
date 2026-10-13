import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { WorkoutDetailModal } from "./WorkoutDetailModal";
import type { IWorkout } from "../types/Workout";

const RATING_LABEL = ["", "Bad", "Okay", "Good", "Great", "Amazing"];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

interface Props {
  workouts: IWorkout[];
  setWorkouts: Dispatch<SetStateAction<IWorkout[]>>;
  loading: boolean;
}

/** The user's own workouts, newest first, with the detail modal. Lives on the Workout (+) page. */
export function WorkoutHistoryList({ workouts, setWorkouts, loading }: Props) {
  const [selectedWorkout, setSelectedWorkout] = useState<IWorkout | null>(null);

  const sorted = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <>
      {loading ? (
        <p>Loading...</p>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <p>No workouts recorded yet</p>
        </div>
      ) : (
        <div className="workout-list">
          {sorted.map((workout) => {
            const totalSets = workout.exercises.reduce((n, ex) => n + ex.sets.length, 0);
            return (
              <div
                key={workout._id}
                className="history-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedWorkout(workout)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedWorkout(workout)}
              >
                <div className="history-card__header">
                  <span className="history-card__name">{workout.name}</span>
                  <span className="history-card__date">{formatDate(workout.date)}</span>
                </div>
                <div className="history-card__meta">
                  <span>{totalSets} sets</span>
                  {workout.durationSeconds ? <span>{formatDuration(workout.durationSeconds)}</span> : null}
                  {workout.isTemplate ? <span className="history-card__template-tag">template</span> : null}
                  {workout.rating != null && (
                    <span className="history-card__rating">Felt {RATING_LABEL[workout.rating]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedWorkout && (
        <WorkoutDetailModal
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onDeleted={() => {
            setWorkouts((prev) => prev.filter((w) => w._id !== selectedWorkout._id));
            setSelectedWorkout(null);
          }}
          onUpdated={(updated) => {
            setWorkouts((prev) => prev.map((w) => (w._id === updated._id ? updated : w)));
            setSelectedWorkout(updated);
          }}
        />
      )}
    </>
  );
}
