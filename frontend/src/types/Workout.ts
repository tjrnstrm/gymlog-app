export interface ISet {
  _id: string;
  reps: number;
  weight: number;
  /** Sets and logged exercises have no position column, so creation time is their order. */
  createdAt: string;
}

export interface IWorkoutExercise {
  _id: string;
  exerciseId: string;
  exerciseName: string;
  sets: ISet[];
  createdAt: string;
}

export interface IWorkout {
  _id: string;
  name: string;
  gym: string;
  date: string;
  notes: string;
  exercises: IWorkoutExercise[];
  rating?: number;
  isTemplate?: boolean;
  durationSeconds?: number;
}
