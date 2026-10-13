// Personal-best calculations over a workout history. Moved out of the ActiveWorkout page unchanged;
// the logic is the same, only the inputs are now explicit. Callers must pass the user's OWN history
// (listMyWorkouts), otherwise a coach's records would include their clients' lifts.

export interface SetLike {
  _id: string;
  reps: number;
  weight: number;
}

export interface LoggedExerciseLike {
  exerciseId: string;
  sets: SetLike[];
}

export interface WorkoutLike {
  _id: string;
  date: string;
  exercises: LoggedExerciseLike[];
}

/** Heaviest set per exercise across the history (more reps wins a tie on weight). */
export function computePersonalBests(history: readonly WorkoutLike[]): Map<string, { reps: number; weight: number }> {
  const pbs = new Map<string, { reps: number; weight: number }>();
  history.forEach((w) => {
    w.exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        const current = pbs.get(ex.exerciseId);
        if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) {
          pbs.set(ex.exerciseId, { reps: set.reps, weight: set.weight });
        }
      });
    });
  });
  return pbs;
}

/**
 * For one workout against the earlier history: which of its sets are new rep records at their
 * weight, and the previous best reps at that weight for every set that has one.
 */
export function computePreviousBests(
  workout: WorkoutLike,
  history: readonly WorkoutLike[],
): { personalBestSetIds: Set<string>; previousBestRepsPerSet: Map<string, number> } {
  const bestRepsByExerciseAndWeight = new Map<string, number>();
  const personalBests = new Set<string>();
  const prevBestReps = new Map<string, number>();
  const previousWorkouts = history
    .filter((historyWorkout) => historyWorkout._id !== workout._id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const trackSet = (exerciseId: string, weight: number, reps: number, setId?: string) => {
    const key = `${exerciseId}:${weight}`;
    const previousBest = bestRepsByExerciseAndWeight.get(key) ?? 0;

    if (setId && reps > previousBest) {
      personalBests.add(setId);
    }

    if (reps > previousBest) {
      bestRepsByExerciseAndWeight.set(key, reps);
    }
  };

  previousWorkouts.forEach((historyWorkout) => {
    historyWorkout.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        trackSet(exercise.exerciseId, set.weight, set.reps);
      });
    });
  });

  workout.exercises.forEach((exercise) => {
    exercise.sets.forEach((set) => {
      const key = `${exercise.exerciseId}:${set.weight}`;
      const previousBest = bestRepsByExerciseAndWeight.get(key) ?? 0;
      if (previousBest > 0) {
        prevBestReps.set(set._id, previousBest);
      }
      trackSet(exercise.exerciseId, set.weight, set.reps, set._id);
    });
  });

  return { personalBestSetIds: personalBests, previousBestRepsPerSet: prevBestReps };
}
