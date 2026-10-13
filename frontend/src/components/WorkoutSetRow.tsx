import { FaCheck } from "react-icons/fa";
import type { ISet } from "../types/Workout";
import type { RowLabel, SetKind } from "../lib/setTypes";

export type SetValueDraft = { reps?: string; weight?: string };

interface Props {
  set: ISet;
  label: RowLabel;
  kind: SetKind;
  /** Last session's set at this position, e.g. "8 × 72.5". */
  previousText: string;
  exerciseName: string;
  draft?: SetValueDraft;
  isDeleting: boolean;
  isPersonalBest: boolean;
  isComplete: boolean;
  onSwipeStart: (setId: string, x: number, y: number) => void;
  onSwipeEnd: (setId: string, x: number, y: number) => void;
  onSwipeCancel: () => void;
  onValueChange: (setId: string, field: "reps" | "weight", value: string) => void;
  onValueCommit: (setId: string, field: "reps" | "weight", value: string) => void;
  onToggleType: (setId: string) => void;
  onToggleComplete: (setId: string) => void;
}

const formatKg = (kg: number) => String(Math.round(kg * 100) / 100);

export function WorkoutSetRow({
  set,
  label,
  kind,
  previousText,
  exerciseName,
  draft,
  isDeleting,
  isPersonalBest,
  isComplete,
  onSwipeStart,
  onSwipeEnd,
  onSwipeCancel,
  onValueChange,
  onValueCommit,
  onToggleType,
  onToggleComplete,
}: Props) {
  const repsValue = draft?.reps ?? set.reps.toString();
  const weightValue = draft?.weight ?? formatKg(set.weight);
  const isPart = kind === "drop-part" || kind === "myo-part";
  const classes = [
    "set-row",
    isComplete ? "set-row--done" : "",
    kind === "warm" ? "set-row--warm" : "",
    isPart ? "set-row--part" : "",
    isDeleting ? "set-row--deleting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onPointerDown={(event) => onSwipeStart(set._id, event.clientX, event.clientY)}
      onPointerUp={(event) => onSwipeEnd(set._id, event.clientX, event.clientY)}
      onPointerCancel={onSwipeCancel}
    >
      <button
        type="button"
        className="set-row__label"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToggleType(set._id)}
        aria-label={`${exerciseName} set type`}
      >
        {label.text}
        {label.tag && <sup>{label.tag}</sup>}
      </button>
      <span className="set-row__previous">
        <span className="set-row__previous-text">{previousText}</span>
        {isPersonalBest && <span className="set-row__pb">PB</span>}
      </span>
      <input
        aria-label={`${exerciseName} weight`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.5"
        value={weightValue}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onValueChange(set._id, "weight", event.target.value)}
        onBlur={() => onValueCommit(set._id, "weight", weightValue)}
      />
      <input
        aria-label={`${exerciseName} reps`}
        type="number"
        inputMode="numeric"
        min="0"
        value={repsValue}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onValueChange(set._id, "reps", event.target.value)}
        onBlur={() => onValueCommit(set._id, "reps", repsValue)}
      />
      <button
        type="button"
        className="set-row__complete"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToggleComplete(set._id)}
        aria-label={isComplete ? "Mark set as not done" : "Mark set as done"}
        aria-pressed={isComplete}
      >
        <FaCheck />
      </button>
    </div>
  );
}
