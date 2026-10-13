import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorkout } from '../api/workouts';
import { useWorkouts } from '../hooks/useWorkouts';
import { WorkoutCard } from '../components/WorkoutCard';
import { WorkoutHistoryList } from '../components/WorkoutHistoryList';
import { GymPickerModal } from '../components/GymPickerModal';

export default function Home() {
  const { workouts, setWorkouts, loading } = useWorkouts();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [gymPickerOpen, setGymPickerOpen] = useState(false);

  const knownGyms = useMemo(
    () => Array.from(new Set(workouts.map((w) => w.gym).filter(Boolean))).sort(),
    [workouts],
  );

  const startWorkout = async (gym: string) => {
    try {
      setStarting(true);
      const workout = await createWorkout({
        name: 'Workout',
        gym,
        date: new Date().toISOString(),
        notes: '',
        exercises: [],
      });
      navigate(`/workouts/${workout._id}`);
    } finally {
      setStarting(false);
      setGymPickerOpen(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h5>Workout</h5>
      </div>
      <div>
        <h5>Quick Start</h5>
        <div className="btn-group">
          <button onClick={() => setGymPickerOpen(true)} disabled={starting}>
            {starting ? 'Starting...' : 'Start Workout'}
          </button>
          <button>Create Template</button>
        </div>
      </div>

      {gymPickerOpen && (
        <GymPickerModal
          gyms={knownGyms}
          onSelect={startWorkout}
          onClose={() => setGymPickerOpen(false)}
        />
      )}
      <div className="section">
        <h3>Saved Workouts</h3>
        {loading ? (
          <p>Loading...</p>
        ) : workouts.filter((w) => w.isTemplate).length === 0 ? (
          <div className="empty-state">
            <p>No templates saved yet. Toggle "Save as template" when finishing a workout.</p>
          </div>
        ) : (
          <div className="workout-list">
            {workouts.filter((w) => w.isTemplate).map((workout) => (
              <WorkoutCard key={workout._id} workout={workout} />
            ))}
          </div>
        )}
      </div>
      <div className="section">
        <h3>History</h3>
        <WorkoutHistoryList workouts={workouts} setWorkouts={setWorkouts} loading={loading} />
      </div>
    </div>
  );
}
