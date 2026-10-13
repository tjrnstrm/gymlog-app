import { createContext } from "react";

export interface ActiveWorkoutContextType {
  activeWorkoutId: string | null;
  activeWorkoutName: string;
  activeWorkoutDate: string | null;
  setActiveWorkout: (id: string, name: string, date: string) => void;
  clearActiveWorkout: () => void;
}

export const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  activeWorkoutId: null,
  activeWorkoutName: "",
  activeWorkoutDate: null,
  setActiveWorkout: () => {},
  clearActiveWorkout: () => {},
});
