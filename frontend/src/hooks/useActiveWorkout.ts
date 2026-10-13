import { useContext } from "react";
import { ActiveWorkoutContext } from "../context/activeWorkoutContextObject";

export const useActiveWorkout = () => useContext(ActiveWorkoutContext);
