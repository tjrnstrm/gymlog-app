import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveWorkout } from "../hooks/useActiveWorkout";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((p) => p.toString().padStart(2, "0")).join(":");
}

export function ActiveWorkoutBanner() {
  const { activeWorkoutId, activeWorkoutName, activeWorkoutDate } = useActiveWorkout();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeWorkoutDate) return;
    const startedAt = new Date(activeWorkoutDate).getTime();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkoutDate]);

  if (!activeWorkoutId) return null;

  return (
    <div
      className="workout-banner"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/workouts/${activeWorkoutId}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/workouts/${activeWorkoutId}`)}
    >
      <span className="workout-banner__name">{activeWorkoutName}</span>
      <span className="workout-banner__timer">{formatDuration(elapsed)}</span>
    </div>
  );
}
