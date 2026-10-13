export interface IExercise {
  _id: string;
  name: string;
  muscleGroups: string[];
  category: string[];
  brand?: string;
  baseExercise?: string | null;
  /** Part of the shared catalogue (managed by admins), as opposed to one of the user's own. */
  isGlobal: boolean;
  /** The user who owns a private exercise; null for global ones. */
  ownerId: string | null;
}

/** Only the owner can change a private exercise (global ones are admin-managed, not editable here). */
export const canEditExercise = (exercise: IExercise, userId: string | undefined): boolean =>
  !exercise.isGlobal && !!userId && exercise.ownerId === userId;
