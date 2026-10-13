import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaChevronDown, FaChevronUp, FaLink, FaThumbtack } from "react-icons/fa";
import { getProgram } from "../../api/programs";
import { AmbiguousExercisesError, startWorkoutFromDay } from "../../api/workouts";
import type { AmbiguousExercise } from "../../api/workouts";
import type { IProgram, IProgramExercise } from "../../types/Platform";

const summary = (e: IProgramExercise) =>
  e.sets !== null && e.reps ? `${e.sets} × ${e.reps}` : e.sets !== null ? `${e.sets} sets` : e.reps || "—";

const isSafeLink = (url: string) => /^https?:\/\//i.test(url);

function ExerciseRow({ exercise, open, onToggle }: { exercise: IProgramExercise; open: boolean; onToggle: () => void }) {
  const hasDetails = exercise.rest || exercise.feeder || exercise.comment || exercise.link;
  return (
    <div className={`prog-ex${open ? " prog-ex--open" : ""}`}>
      <button type="button" className="prog-ex__row" aria-expanded={open} onClick={onToggle}>
        <span className="prog-ex__name">{exercise.name}</span>
        <span className="prog-ex__right">
          <span className="display prog-ex__summary">{summary(exercise)}</span>
          {open ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="prog-ex__body">
          {!hasDetails && <p className="muted">Nothing more from your coach on this one.</p>}
          {exercise.rest && (
            <p><strong>Rest</strong> · {exercise.rest}</p>
          )}
          {exercise.feeder && (
            <p><strong>Feeder sets</strong> · {exercise.feeder}</p>
          )}
          {(exercise.comment || exercise.link) && (
            <div className="pinned">
              <span className="pinned__label"><FaThumbtack size={12} /> Pinned by coach</span>
              {exercise.comment && <p>{exercise.comment}</p>}
              {exercise.link && isSafeLink(exercise.link) && (
                <a href={exercise.link} target="_blank" rel="noopener noreferrer" className="pinned__link">
                  <FaLink size={13} /> Open link
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientProgram() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [program, setProgram] = useState<IProgram | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Programme exercises whose name matches more than one of the user's exercises; they pick which.
  const [ambiguous, setAmbiguous] = useState<AmbiguousExercise[] | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    getProgram(id)
      .then(setProgram)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the program"));
  }, [id]);

  if (error) return <div className="stack"><p className="form-error">{error}</p><Link to="/client">Back</Link></div>;
  if (!program) return <p>Loading program...</p>;

  const day = program.days[dayIndex];

  async function handleStart(chosen: Record<string, string> = {}) {
    if (!day || day.exercises.length === 0) return;
    setStarting(true);
    setError(null);
    try {
      const workoutId = await startWorkoutFromDay(
        day.name,
        day.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
        chosen,
      );
      navigate(`/workouts/${workoutId}`);
    } catch (err) {
      if (err instanceof AmbiguousExercisesError) {
        setAmbiguous(err.ambiguous);
        setChoices(chosen);
      } else {
        setError(err instanceof Error ? err.message : "Could not start the workout");
      }
      setStarting(false);
    }
  }

  return (
    <div className="stack">
      <Link to="/client" className="muted small">← From your coach</Link>
      <div className="stack stack--tight">
        <h1 className="display page-title">{program.name}</h1>
        <span className="muted">{program.days.length} {program.days.length === 1 ? "day" : "days"}</span>
      </div>

      {program.message && (
        <div className="card">
          <span className="eyebrow">Message from your coach</span>
          <p>{program.message}</p>
        </div>
      )}

      <nav aria-label="Program days" className="day-tabs">
        {program.days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            className={`day-tab${i === dayIndex ? " day-tab--active" : ""}`}
            aria-current={i === dayIndex ? "true" : undefined}
            onClick={() => { setDayIndex(i); setOpenKey(null); }}
          >
            {d.name}
          </button>
        ))}
      </nav>

      {day ? (
        <>
          <div className="stack stack--tight">
            <h2 className="display">{day.name}</h2>
            <span className="muted">{day.exercises.length} {day.exercises.length === 1 ? "exercise" : "exercises"}</span>
          </div>
          {ambiguous ? (
            <div className="card stack stack--tight">
              <h3 className="display">Which exercise do you mean?</h3>
              <p className="muted">You have more than one exercise with these names. Pick the one to log.</p>
              {ambiguous.map((a) => (
                <label key={a.key}>
                  {a.name}
                  <select value={choices[a.key] ?? ""} onChange={(e) => setChoices({ ...choices, [a.key]: e.target.value })}>
                    <option value="" disabled>Choose…</option>
                    {a.options.map((o, i) => (
                      <option key={o.id} value={o.id}>{o.name} — {o.isGlobal ? "shared" : "yours"} ({i + 1})</option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="row">
                <button
                  type="button"
                  className="btn-primary grow"
                  disabled={starting || ambiguous.some((a) => !choices[a.key])}
                  onClick={() => void handleStart(choices)}
                >
                  {starting ? "Starting..." : "Start workout"}
                </button>
                <button type="button" className="grow" onClick={() => setAmbiguous(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void handleStart()} disabled={starting || day.exercises.length === 0}>
              {starting ? "Starting..." : "Start this workout"}
            </button>
          )}
          <div className="stack stack--tight">
            {day.exercises.map((e) => (
              <ExerciseRow key={e.id} exercise={e} open={openKey === e.id} onToggle={() => setOpenKey(openKey === e.id ? null : e.id)} />
            ))}
          </div>
        </>
      ) : (
        <p className="muted">This program has no days yet.</p>
      )}
    </div>
  );
}
