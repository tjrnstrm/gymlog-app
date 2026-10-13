import { useState } from "react";
import type { IExercise } from "../types/Exercise";
import type { ISet, IWorkoutExercise } from "../types/Workout";
import { buildClusters, rowLabel } from "../lib/setTypes";
import type { Cluster, SetKind } from "../lib/setTypes";
import { ExerciseMenu } from "./ExerciseMenu";
import { WorkoutSetRow } from "./WorkoutSetRow";
import type { SetValueDraft } from "./WorkoutSetRow";

/** Everything the table needs from the workout page, so the components stay free of data fetching. */
export interface WorkoutController {
  kinds: Record<string, SetKind>;
  doneIds: Set<string>;
  drafts: Record<string, SetValueDraft>;
  deletingSetId: string | null;
  personalBestSetIds: Set<string>;
  /** Last session's sets for an exercise, in order. */
  previousSets: (exerciseId: string) => { reps: number; weight: number }[];
  changeExercises: IExercise[];
  fullExercise: (exerciseId: string) => IExercise | undefined;
  nextExercise: (exercise: IWorkoutExercise) => IWorkoutExercise | undefined;
  onSwipeStart: (setId: string, x: number, y: number) => void;
  onSwipeEnd: (exercise: IWorkoutExercise, setId: string, x: number, y: number) => void;
  onSwipeCancel: () => void;
  onValueChange: (setId: string, field: "reps" | "weight", value: string) => void;
  onValueCommit: (exercise: IWorkoutExercise, setId: string, field: "reps" | "weight", value: string) => void;
  onToggleDone: (exercise: IWorkoutExercise, set: ISet) => void;
  onSetKind: (exercise: IWorkoutExercise, set: ISet, kind: "work" | "warm" | "drop" | "myo" | "delete") => void;
  onAddSet: (exercise: IWorkoutExercise, kind: "work" | "warm" | "drop" | "myo") => void;
  onPairWithNext: (exercise: IWorkoutExercise) => void;
  onRemoveSuperset: (exercise: IWorkoutExercise) => void;
  onRemoveExercise: (exercise: IWorkoutExercise) => void;
  onChangeExercise: (exercise: IWorkoutExercise, newExercise: IExercise) => void;
  onExerciseUpdated: (exercise: IWorkoutExercise, updated: IExercise) => void;
}

interface Props {
  /** One exercise, or the exercises of a superset in the order they are done. */
  exercises: IWorkoutExercise[];
  controller: WorkoutController;
}

const LETTERS = "ABCDEFG";
const formatKg = (kg: number) => String(Math.round(kg * 100) / 100);

const KIND_CHOICES: { kind: "work" | "warm" | "drop" | "myo"; label: string }[] = [
  { kind: "work", label: "Working" },
  { kind: "warm", label: "Warm-up" },
  { kind: "drop", label: "Drop set" },
  { kind: "myo", label: "Myo-reps" },
];

export function ActiveWorkoutExercise({ exercises, controller: c }: Props) {
  const [typeOpenFor, setTypeOpenFor] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const grouped = exercises.length > 1;

  const clusterLists = exercises.map((exercise) => buildClusters(exercise, c.kinds));
  const warmLists = clusterLists.map((list) => list.filter((cluster) => cluster.kind === "warm"));
  const workLists = clusterLists.map((list) => list.filter((cluster) => cluster.kind !== "warm"));

  function renderCluster(exercise: IWorkoutExercise, cluster: Cluster, letter: string) {
    const previous = c.previousSets(exercise.exerciseId);
    const topId = cluster.sets[0]._id;
    const clusterKind = cluster.kind;
    const rows = cluster.sets.map((set, partIndex) => {
      const absoluteIndex = exercise.sets.indexOf(set);
      const prev = previous[absoluteIndex];
      return (
        <WorkoutSetRow
          key={set._id}
          set={set}
          label={rowLabel(cluster, partIndex, letter)}
          kind={c.kinds[set._id] ?? "work"}
          previousText={prev ? `${prev.reps} × ${formatKg(prev.weight)}` : "–"}
          exerciseName={exercise.exerciseName}
          draft={c.drafts[set._id]}
          isDeleting={c.deletingSetId === set._id}
          isPersonalBest={c.personalBestSetIds.has(set._id)}
          isComplete={c.doneIds.has(set._id)}
          onSwipeStart={c.onSwipeStart}
          onSwipeEnd={(setId, x, y) => c.onSwipeEnd(exercise, setId, x, y)}
          onSwipeCancel={c.onSwipeCancel}
          onValueChange={c.onValueChange}
          onValueCommit={(setId, field, value) => c.onValueCommit(exercise, setId, field, value)}
          onToggleType={() => setTypeOpenFor((open) => (open === topId ? null : topId))}
          onToggleComplete={() => c.onToggleDone(exercise, set)}
        />
      );
    });
    return (
      <div key={topId} className="set-cluster">
        {rows}
        {typeOpenFor === topId && (
          <div className="set-picker">
            {KIND_CHOICES.map((choice) => (
              <button
                key={choice.kind}
                type="button"
                className={`set-chip${clusterKind === choice.kind ? " set-chip--on" : ""}`}
                onClick={() => { c.onSetKind(exercise, cluster.sets[0], choice.kind); setTypeOpenFor(null); }}
              >
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              className="set-chip set-chip--delete"
              onClick={() => { c.onSetKind(exercise, cluster.sets[0], "delete"); setTypeOpenFor(null); }}
            >
              Delete set
            </button>
          </div>
        )}
      </div>
    );
  }

  const body: React.ReactNode[] = [];
  if (!grouped) {
    clusterLists[0].forEach((cluster) => body.push(renderCluster(exercises[0], cluster, "")));
  } else {
    // Warm-ups first, then each working round across the exercises (1A, 1B, 2A, 2B ...).
    for (const lists of [warmLists, workLists]) {
      const rounds = Math.max(...lists.map((list) => list.length), 0);
      for (let round = 0; round < rounds; round += 1) {
        exercises.forEach((exercise, index) => {
          const cluster = lists[index][round];
          if (cluster) body.push(renderCluster(exercise, cluster, LETTERS[index]));
        });
      }
    }
  }

  const menuFor = (exercise: IWorkoutExercise) => {
    const next = c.nextExercise(exercise);
    return (
      <ExerciseMenu
        exercise={exercise}
        fullExercise={c.fullExercise(exercise.exerciseId)}
        changeExercises={c.changeExercises}
        pairWithName={next?.exerciseName}
        inSuperset={grouped}
        onPairWithNext={() => c.onPairWithNext(exercise)}
        onRemoveSuperset={() => c.onRemoveSuperset(exercise)}
        onRemoveExercise={() => c.onRemoveExercise(exercise)}
        onChangeExercise={(newExercise) => c.onChangeExercise(exercise, newExercise)}
        onExerciseUpdated={(updated) => c.onExerciseUpdated(exercise, updated)}
      />
    );
  };

  return (
    <div className="active-exercise">
      <div className="active-exercise__header">
        {grouped && <span className="active-exercise__superset-tag">Superset</span>}
        {exercises.map((exercise, index) => (
          <div key={exercise._id} className="active-exercise__title">
            <h4>
              {grouped && <span className="active-exercise__letter">{LETTERS[index]}</span>}
              {exercise.exerciseName}
            </h4>
            {menuFor(exercise)}
          </div>
        ))}
      </div>

      <div className="set-table__cols">
        <span>Set</span>
        <span>Previous</span>
        <span>kg</span>
        <span>Reps</span>
        <span />
      </div>

      <div className="set-list">
        {exercises.every((exercise) => exercise.sets.length === 0) ? <p>No sets yet</p> : body}
      </div>

      <div className="set-add">
        <button
          type="button"
          className="set-add__button"
          onClick={() => exercises.forEach((exercise) => c.onAddSet(exercise, "work"))}
        >
          {grouped ? "+ Round" : "+ Set"}
        </button>
        {!grouped && (
          <button type="button" className="set-add__more" onClick={() => setAddOpen((open) => !open)}>
            {addOpen ? "Hide types" : "Set types"}
          </button>
        )}
      </div>
      {addOpen && !grouped && (
        <div className="set-picker">
          {KIND_CHOICES.slice(1).map((choice) => (
            <button
              key={choice.kind}
              type="button"
              className="set-chip"
              onClick={() => { c.onAddSet(exercises[0], choice.kind); setAddOpen(false); }}
            >
              + {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
