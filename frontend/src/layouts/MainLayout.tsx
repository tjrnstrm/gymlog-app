import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ActiveWorkoutBanner } from '../components/ActiveWorkoutBanner';
import { useActiveWorkout } from '../hooks/useActiveWorkout';

export default function MainLayout() {
  const { activeWorkoutId } = useActiveWorkout();
  const location = useLocation();
  const isOnActiveWorkout = activeWorkoutId && location.pathname === `/workouts/${activeWorkoutId}`;

  return (
    <div id="content">
      <Outlet />
      <div id="bottom-bar">
        {!isOnActiveWorkout && <ActiveWorkoutBanner />}
        <Navbar />
      </div>
    </div>
  );
}
