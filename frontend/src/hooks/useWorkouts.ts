import { useState, useEffect } from 'react';
import { getMyWorkouts } from '../api/workouts';
import type { IWorkout } from '../types/Workout';

export function useWorkouts() {
  const [workouts, setWorkouts] = useState<IWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyWorkouts()
      .then(setWorkouts)
      .catch(() => setError('Failed to load workouts'))
      .finally(() => setLoading(false));
  }, []);

  return { workouts, setWorkouts, loading, error };
}
