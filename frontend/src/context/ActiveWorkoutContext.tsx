import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ActiveWorkoutContext } from "./activeWorkoutContextObject";

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [activeWorkoutName, setActiveWorkoutName] = useState("");
  const [activeWorkoutDate, setActiveWorkoutDate] = useState<string | null>(null);

  const setActiveWorkout = useCallback((id: string, name: string, date: string) => {
    setActiveWorkoutId(id);
    setActiveWorkoutName(name);
    setActiveWorkoutDate(date);
  }, []);

  const clearActiveWorkout = useCallback(() => {
    setActiveWorkoutId(null);
    setActiveWorkoutName("");
    setActiveWorkoutDate(null);
  }, []);

  return (
    <ActiveWorkoutContext.Provider
      value={{ activeWorkoutId, activeWorkoutName, activeWorkoutDate, setActiveWorkout, clearActiveWorkout }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  );
}
