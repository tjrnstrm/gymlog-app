import { useState } from "react";
import { FaEllipsisH } from "react-icons/fa";
import type { IExercise } from "../types/Exercise";
import type { IWorkoutExercise } from "../types/Workout";
import { EditExerciseModal } from "./EditExerciseModal";

interface Props {
  exercise: IWorkoutExercise;
  fullExercise: IExercise | undefined;
  changeExercises: IExercise[];
  /** The exercise after this one, when it can be paired into a superset. */
  pairWithName?: string;
  inSuperset: boolean;
  onPairWithNext: () => void;
  onRemoveSuperset: () => void;
  onRemoveExercise: () => void;
  onChangeExercise: (newExercise: IExercise) => void;
  onExerciseUpdated: (updated: IExercise) => void;
}

/** The "..." menu on an exercise: edit, change, superset, remove. */
export function ExerciseMenu({
  exercise,
  fullExercise,
  changeExercises,
  pairWithName,
  inSuperset,
  onPairWithNext,
  onRemoveSuperset,
  onRemoveExercise,
  onChangeExercise,
  onExerciseUpdated,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChangePicker, setShowChangePicker] = useState(false);

  return (
    <div className="exercise-menu">
      <button
        type="button"
        className="exercise-menu__trigger"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={`${exercise.exerciseName} options`}
      >
        <FaEllipsisH />
      </button>
      {menuOpen && (
        <>
          <div className="exercise-menu__backdrop" onClick={() => setMenuOpen(false)} />
          <div className="exercise-menu__dropdown">
            <button onClick={() => { setMenuOpen(false); setShowEditModal(true); }}>Edit exercise</button>
            <button onClick={() => { setMenuOpen(false); setShowChangePicker(true); }}>Change exercise</button>
            {inSuperset ? (
              <button onClick={() => { setMenuOpen(false); onRemoveSuperset(); }}>Remove superset</button>
            ) : (
              pairWithName && (
                <button onClick={() => { setMenuOpen(false); onPairWithNext(); }}>
                  Superset with {pairWithName}
                </button>
              )
            )}
            <button className="btn-danger" onClick={() => { setMenuOpen(false); onRemoveExercise(); }}>
              Remove
            </button>
          </div>
        </>
      )}

      {showEditModal && fullExercise && (
        <EditExerciseModal
          exercise={fullExercise}
          onClose={() => setShowEditModal(false)}
          onUpdated={(updated) => { onExerciseUpdated(updated); setShowEditModal(false); }}
          onDeleted={() => { onRemoveExercise(); setShowEditModal(false); }}
        />
      )}

      {showChangePicker && (
        <div className="modal-overlay" onClick={() => setShowChangePicker(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h5>Change exercise</h5>
              <button type="button" className="modal__close" onClick={() => setShowChangePicker(false)}>✕</button>
            </div>
            <div className="exercise-picker">
              {changeExercises.length === 0 ? (
                <p>No other exercises available</p>
              ) : (
                changeExercises.map((candidate) => (
                  <button
                    key={candidate._id}
                    type="button"
                    onClick={() => { onChangeExercise(candidate); setShowChangePicker(false); }}
                  >
                    {candidate.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
