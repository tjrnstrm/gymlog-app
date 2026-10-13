import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaEllipsisH } from "react-icons/fa";
import type { IWorkout } from "../types/Workout";
import {
  addExercise,
  addSet,
  createWorkout,
  deleteSet,
  deleteWorkout,
  getMyWorkout,
  updateSet,
  updateWorkout,
} from "../api/workouts";

interface DraftSet {
  _id?: string;
  reps: number;
  weight: number;
}

interface Props {
  workout: IWorkout;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updated: IWorkout) => void;
}

const RATINGS = [
  { value: 1, label: "Bad" },
  { value: 2, label: "Okay" },
  { value: 3, label: "Good" },
  { value: 4, label: "Great" },
  { value: 5, label: "Amazing" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export function WorkoutDetailModal({ workout, onClose, onDeleted, onUpdated }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [draftName, setDraftName] = useState(workout.name);
  const [draftRating, setDraftRating] = useState<number | null>(workout.rating ?? null);
  const [draftSets, setDraftSets] = useState<Record<string, DraftSet[]>>(
    Object.fromEntries(
      workout.exercises.map((ex) => [
        ex._id,
        ex.sets.map((s) => ({ _id: s._id, reps: s.reps, weight: s.weight })),
      ])
    )
  );

  const enterEdit = () => {
    setDraftName(workout.name);
    setDraftSets(
      Object.fromEntries(
        workout.exercises.map((ex) => [
          ex._id,
          ex.sets.map((s) => ({ _id: s._id, reps: s.reps, weight: s.weight })),
        ])
      )
    );
    setDraftRating(workout.rating ?? null);
    setEditMode(true);
    setMenuOpen(false);
  };

  const handleDraftSetChange = (
    exerciseId: string,
    index: number,
    field: "reps" | "weight",
    value: string
  ) => {
    setDraftSets((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) =>
        i === index ? { ...s, [field]: Number(value) || 0 } : s
      ),
    }));
  };

  const handleAddDraftSet = (exerciseId: string) => {
    setDraftSets((prev) => {
      const sets = prev[exerciseId];
      const last = sets[sets.length - 1];
      return {
        ...prev,
        [exerciseId]: [...sets, { reps: last?.reps ?? 1, weight: last?.weight ?? 0 }],
      };
    });
  };

  const handleRemoveDraftSet = (exerciseId: string, index: number) => {
    setDraftSets((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const nameChanged = draftName.trim() !== workout.name;
      const ratingChanged = (draftRating ?? undefined) !== workout.rating;
      if (nameChanged || ratingChanged) {
        await updateWorkout(workout._id, {
          name: draftName.trim() || workout.name,
          rating: draftRating ?? undefined,
        });
      }

      for (const exercise of workout.exercises) {
        const draft = draftSets[exercise._id] ?? [];

        const draftSetIds = new Set(draft.filter((s) => s._id).map((s) => s._id!));
        for (const orig of exercise.sets) {
          if (!draftSetIds.has(orig._id)) {
            await deleteSet(workout._id, exercise._id, orig._id);
          }
        }

        for (const ds of draft) {
          if (ds._id) {
            const orig = exercise.sets.find((s) => s._id === ds._id);
            if (orig && (orig.reps !== ds.reps || orig.weight !== ds.weight)) {
              await updateSet(workout._id, exercise._id, ds._id, {
                reps: ds.reps,
                weight: ds.weight,
              });
            }
          } else {
            await addSet(workout._id, exercise._id, { reps: ds.reps, weight: ds.weight });
          }
        }
      }

      const updated = await getMyWorkout(workout._id);
      onUpdated(updated);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteWorkout(workout._id);
    onDeleted();
  };

  const handleRepeat = async () => {
    setRepeating(true);
    try {
      const newWorkout = await createWorkout({
        name: workout.name,
        gym: workout.gym,
        date: new Date().toISOString(),
        notes: "",
        exercises: [],
      });

      for (const ex of workout.exercises) {
        const updated = await addExercise(newWorkout._id, {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
        });
        const newEx = updated.exercises.find((e) => e.exerciseId === ex.exerciseId);
        if (newEx) {
          for (const set of ex.sets) {
            await addSet(newWorkout._id, newEx._id, { reps: set.reps, weight: set.weight });
          }
        }
      }

      onClose();
      navigate(`/workouts/${newWorkout._id}`);
    } finally {
      setRepeating(false);
    }
  };

  const totalSets = workout.exercises.reduce((n, ex) => n + ex.sets.length, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal workout-detail-modal" onClick={(e) => e.stopPropagation()}>
        {editMode ? (
          <div className="workout-detail-modal__header workout-detail-modal__header--edit">
            <button
              type="button"
              className="workout-detail-modal__back-btn"
              onClick={() => setEditMode(false)}
            >
              <FaArrowLeft />
            </button>
            <input
              className="workout-detail-modal__name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
            />
            <button type="button" className="modal__close" onClick={onClose}>
              ✕
            </button>
          </div>
        ) : (
          <div className="workout-detail-modal__header">
            <div className="workout-detail-modal__title-area">
              <h5 className="workout-detail-modal__name">{workout.name}</h5>
              <span className="workout-detail-modal__meta">
                {formatDate(workout.date)}
                {" · "}
                {totalSets} set{totalSets !== 1 ? "s" : ""}
                {workout.durationSeconds
                  ? ` · ${formatDuration(workout.durationSeconds)}`
                  : ""}
              </span>
            </div>
            <div className="workout-detail-modal__actions">
              <div className="exercise-menu">
                <button
                  className="exercise-menu__trigger"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <FaEllipsisH />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="exercise-menu__backdrop"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="exercise-menu__dropdown">
                      <button onClick={enterEdit}>Edit workout</button>
                      <button onClick={handleRepeat} disabled={repeating}>
                        {repeating ? "Starting..." : "Repeat workout"}
                      </button>
                      <button className="btn-danger" onClick={handleDelete}>
                        Delete workout
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="modal__close" onClick={onClose}>
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="workout-detail-modal__content">
          {editMode && (
            <div className="finish-modal__ratings workout-detail-modal__rating-edit">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`finish-modal__rating${draftRating === r.value ? " finish-modal__rating--selected" : ""}`}
                  onClick={() => setDraftRating(r.value === draftRating ? null : r.value)}
                >
                  <span className="finish-modal__num">{r.value}</span>
                  <span className="finish-modal__label">{r.label}</span>
                </button>
              ))}
            </div>
          )}
          {workout.exercises.length === 0 ? (
            <p className="workout-detail-modal__empty">No exercises recorded</p>
          ) : (
            <>
              {workout.exercises.map((exercise) => (
                <div key={exercise._id} className="workout-detail-modal__exercise">
                  <span className="workout-detail-modal__exercise-name">
                    {exercise.exerciseName}
                  </span>

                  <div className="workout-detail-modal__sets">
                    {editMode
                      ? (draftSets[exercise._id] ?? []).map((set, i) => (
                          <div key={i} className="workout-detail-modal__set">
                            <span className="workout-detail-modal__set-num">{i + 1}</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              className="workout-detail-modal__set-input"
                              value={set.reps}
                              onChange={(e) =>
                                handleDraftSetChange(exercise._id, i, "reps", e.target.value)
                              }
                            />
                            <span className="workout-detail-modal__set-sep">×</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className="workout-detail-modal__set-input"
                              value={set.weight}
                              onChange={(e) =>
                                handleDraftSetChange(exercise._id, i, "weight", e.target.value)
                              }
                            />
                            <span className="workout-detail-modal__set-unit">kg</span>
                            <button
                              type="button"
                              className="workout-detail-modal__remove-set"
                              onClick={() => handleRemoveDraftSet(exercise._id, i)}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      : exercise.sets.map((set, i) => (
                          <div key={set._id} className="workout-detail-modal__set">
                            <span className="workout-detail-modal__set-num">{i + 1}</span>
                            <span className="workout-detail-modal__set-value">
                              {set.reps} × {set.weight}kg
                            </span>
                          </div>
                        ))}

                    {editMode && (
                      <button
                        type="button"
                        className="workout-detail-modal__add-set"
                        onClick={() => handleAddDraftSet(exercise._id)}
                      >
                        + Add set
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {editMode && (
                <button
                  type="button"
                  className="btn-success workout-detail-modal__save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
