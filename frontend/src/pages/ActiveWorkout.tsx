import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { computePersonalBests, computePreviousBests } from "@bro-split/database";
import { ActiveExercisePicker } from "../components/ActiveExercisePicker";
import { ActiveWorkoutExercise } from "../components/ActiveWorkoutExercise";
import type { WorkoutController } from "../components/ActiveWorkoutExercise";
import { ActiveWorkoutHeader } from "../components/ActiveWorkoutHeader";
import { FinishWorkoutModal } from "../components/FinishWorkoutModal";
import { RestCue } from "../components/RestCue";
import { useActiveWorkout } from "../hooks/useActiveWorkout";
import { useRestCue } from "../hooks/useRestCue";
import { useWorkoutMeta } from "../hooks/useWorkoutMeta";

import type { SetValueDraft } from "../components/WorkoutSetRow";
import {
  addExercise,
  addSet,
  addSets,
  deleteSet,
  deleteExercise as removeExerciseFromWorkout,
  deleteWorkout,
  getMyWorkout,
  getMyWorkouts,
  updateSet,
  updateWorkout,
} from "../api/workouts";
import { useExercises } from "../hooks/useExercises";
import { REST_SECONDS, buildBlocks, buildClusters, clusterInRound, isPart, partsFor, roundOf, snapWeight } from "../lib/setTypes";
import type { SetKind } from "../lib/setTypes";
import type { IExercise } from "../types/Exercise";
import type { ISet, IWorkout, IWorkoutExercise } from "../types/Workout";

type SwipeStart = {
  setId: string;
  x: number;
  y: number;
};

const formatKg = (kg: number) => String(Math.round(kg * 100) / 100);
const isoPlus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

export default function ActiveWorkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setActiveWorkout, clearActiveWorkout } = useActiveWorkout();
  const { exercises, loading: exercisesLoading } = useExercises();
  const [workout, setWorkout] = useState<IWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [setValueDrafts, setSetValueDrafts] = useState<Record<string, SetValueDraft>>({});
  const [workoutHistory, setWorkoutHistory] = useState<IWorkout[]>([]);
  const [swipeStart, setSwipeStart] = useState<SwipeStart | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const meta = useWorkoutMeta(id);
  const restCue = useRestCue();

  useEffect(() => {
    if (!id) return;

    Promise.all([getMyWorkout(id), getMyWorkouts()])
      .then(([selectedWorkout, workouts]) => {
        setWorkout(selectedWorkout);
        setWorkoutHistory(workouts);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const workoutId = workout?._id;
  const workoutName = workout?.name;
  const workoutDate = workout?.date;
  useEffect(() => {
    if (!id || !workoutId || workoutName === undefined || workoutDate === undefined) return;
    setActiveWorkout(id, workoutName, workoutDate);
  }, [id, workoutId, workoutName, workoutDate, setActiveWorkout]);

  useEffect(() => {
    if (!workoutDate) return;

    const startedAt = new Date(workoutDate).getTime();
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    updateElapsed();
    timerRef.current = window.setInterval(updateElapsed, 1000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [workoutDate]);

  const addedExerciseIds = useMemo(
    () => new Set(workout?.exercises.map((exercise) => exercise.exerciseId) ?? []),
    [workout?.exercises],
  );

  const availableExercises = exercises.filter((exercise) => !addedExerciseIds.has(exercise._id));

  const knownGyms = useMemo(
    () => Array.from(new Set(workoutHistory.map((w) => w.gym).filter(Boolean))).sort(),
    [workoutHistory],
  );

  const gymExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    if (!workout?.gym) return ids;
    workoutHistory.forEach((w) => {
      if (w.gym === workout.gym) {
        w.exercises.forEach((e) => ids.add(e.exerciseId));
      }
    });
    return ids;
  }, [workoutHistory, workout]);

  const exercisePbs = useMemo(() => computePersonalBests(workoutHistory), [workoutHistory]);

  // Warm-ups never count towards a record.
  const personalBestSetIds = useMemo(() => {
    if (!workout) return new Set<string>();
    const workingOnly = {
      ...workout,
      exercises: workout.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.filter((set) => (meta.kinds[set._id] ?? "work") !== "warm"),
      })),
    };
    return computePreviousBests(workingOnly, workoutHistory).personalBestSetIds;
  }, [workout, workoutHistory, meta.kinds]);

  // Last session's sets per exercise: the "previous" column and the starting values for new sets.
  const previousByExercise = useMemo(() => {
    const byExercise = new Map<string, { reps: number; weight: number }[]>();
    const currentTime = workoutDate ? new Date(workoutDate).getTime() : Infinity;
    [...workoutHistory]
      .filter((w) => w._id !== workoutId && new Date(w.date).getTime() <= currentTime)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((w) =>
        w.exercises.forEach((exercise) => {
          if (exercise.sets.length > 0) {
            byExercise.set(exercise.exerciseId, exercise.sets.map((s) => ({ reps: s.reps, weight: s.weight })));
          }
        }),
      );
    return byExercise;
  }, [workoutHistory, workoutId, workoutDate]);

  const blocks = useMemo(
    () => (workout ? buildBlocks(workout.exercises, meta.groups) : []),
    [workout, meta.groups],
  );

  const handleRemoveExercise = async (workoutExerciseId: string) => {
    if (!id) return;
    await removeExerciseFromWorkout(id, workoutExerciseId);
    meta.unlink(workoutExerciseId);
    setWorkout((current) =>
      current
        ? { ...current, exercises: current.exercises.filter((e) => e._id !== workoutExerciseId) }
        : current,
    );
  };

  const handleChangeExercise = async (workoutExercise: IWorkoutExercise, newExercise: IExercise) => {
    if (!id) return;
    await removeExerciseFromWorkout(id, workoutExercise._id);
    meta.unlink(workoutExercise._id);
    const updated = await addExercise(id, { exerciseId: newExercise._id, exerciseName: newExercise.name });
    const newWorkoutExercise = updated.exercises.find((e) => e.exerciseId === newExercise._id);
    const first = previousByExercise.get(newExercise._id)?.[0];
    const withSet = newWorkoutExercise
      ? await addSet(id, newWorkoutExercise._id, first ?? { reps: 1, weight: 0 })
      : updated;
    setWorkout(withSet);
  };

  const handleExerciseUpdated = (workoutExerciseId: string, updated: IExercise) => {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((e) =>
              e._id === workoutExerciseId ? { ...e, exerciseName: updated.name } : e,
            ),
          }
        : current,
    );
  };

  const handleAddExercise = async (exercise: IExercise) => {
    if (!id) return;

    const updated = await addExercise(id, {
      exerciseId: exercise._id,
      exerciseName: exercise.name,
    });

    const newExercise = updated.exercises.find((e) => e.exerciseId === exercise._id);
    // Start from what you did last time, so the usual session is just ticking boxes.
    const first = previousByExercise.get(exercise._id)?.[0];
    const withSet = newExercise
      ? await addSet(id, newExercise._id, first ?? { reps: 0, weight: 0 })
      : updated;

    setWorkout(withSet);
    setExercisePickerOpen(false);
  };

  const handleGymChange = async (gym: string) => {
    if (!id) return;
    const updated = await updateWorkout(id, { gym });
    setWorkout(updated);
  };

  const handleWorkoutNameChange = (name: string) => {
    setWorkout((current) => (current ? { ...current, name } : current));
  };

  const handleWorkoutNameCommit = async (name: string) => {
    if (!id || !workout) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setWorkout({ ...workout, name: "Workout" });
      await updateWorkout(id, { name: "Workout" });
      return;
    }

    const updated = await updateWorkout(id, { name: trimmedName });
    setWorkout(updated);
  };

  /** Adds a working set, a warm-up, a drop set or myo-reps to an exercise. */
  const handleAddSet = async (exercise: IWorkoutExercise, kind: "work" | "warm" | "drop" | "myo") => {
    if (!id) return;

    const lastWorking = [...exercise.sets]
      .reverse()
      .find((set) => !isPart(meta.kinds[set._id] ?? "work") && (meta.kinds[set._id] ?? "work") !== "warm");
    const base =
      lastWorking ??
      exercise.sets[exercise.sets.length - 1] ??
      previousByExercise.get(exercise.exerciseId)?.[0] ?? { reps: 0, weight: 0 };

    // Rows added together share a timestamp, so give them explicit, increasing ones that sort after
    // the existing sets (relative to their times, not this device's clock).
    const anchor = exercise.sets[exercise.sets.length - 1]?.createdAt ?? exercise.createdAt;
    let rows: { reps: number; weight: number; createdAt?: string }[];
    if (kind === "work") {
      rows = [{ reps: base.reps, weight: base.weight }];
    } else if (kind === "warm") {
      const before = exercise.sets[0]?.createdAt ?? anchor;
      rows = [
        { reps: 10, weight: snapWeight(base.weight * 0.5), createdAt: isoPlus(before, exercise.sets.length ? -1000 : 1) },
      ];
    } else {
      const top = { reps: kind === "myo" ? 15 : base.reps, weight: base.weight };
      rows = [top, ...partsFor(kind, top)].map((row, index) => ({ ...row, createdAt: isoPlus(anchor, index + 1) }));
    }

    const knownIds = new Set(exercise.sets.map((set) => set._id));
    const updated = await addSets(id, exercise._id, rows);
    setWorkout(updated);

    const created = (updated.exercises.find((e) => e._id === exercise._id)?.sets ?? []).filter(
      (s) => !knownIds.has(s._id),
    );
    if (kind === "warm" && created[0]) meta.setKinds({ [created[0]._id]: "warm" });
    if ((kind === "drop" || kind === "myo") && created.length > 0) {
      const part: SetKind = kind === "drop" ? "drop-part" : "myo-part";
      meta.setKinds(Object.fromEntries(created.map((s, i) => [s._id, i === 0 ? kind : part])));
    }
  };

  /** Changes the type of the set that starts a cluster (adding or removing its parts), or deletes it. */
  const handleSetKind = async (
    exercise: IWorkoutExercise,
    top: ISet,
    kind: "work" | "warm" | "drop" | "myo" | "delete",
  ) => {
    if (!id) return;
    const cluster = buildClusters(exercise, meta.kinds).find((cl) => cl.sets[0]._id === top._id);
    if (!cluster) return;
    const parts = cluster.sets.slice(1);

    if (kind === "delete") {
      await Promise.all(cluster.sets.map((set) => deleteSet(id, exercise._id, set._id)));
      const removed = new Set(cluster.sets.map((set) => set._id));
      setWorkout((current) =>
        current
          ? {
              ...current,
              exercises: current.exercises.map((e) =>
                e._id === exercise._id ? { ...e, sets: e.sets.filter((s) => !removed.has(s._id)) } : e,
              ),
            }
          : current,
      );
      meta.forget([...removed]);
      return;
    }
    if (cluster.kind === kind) return;

    if (parts.length > 0) await Promise.all(parts.map((set) => deleteSet(id, exercise._id, set._id)));
    meta.forget(parts.map((set) => set._id));

    const known = new Set(exercise.sets.map((set) => set._id));
    let updated: IWorkout;
    if (kind === "drop" || kind === "myo") {
      const rows = partsFor(kind, { reps: top.reps, weight: top.weight }).map((row, index) => ({
        ...row,
        createdAt: isoPlus(top.createdAt, index + 1),
      }));
      updated = await addSets(id, exercise._id, rows);
    } else {
      updated = await getMyWorkout(id);
    }
    setWorkout(updated);

    const created = (updated.exercises.find((e) => e._id === exercise._id)?.sets ?? []).filter(
      (s) => !known.has(s._id),
    );
    const partKind: SetKind = kind === "drop" ? "drop-part" : "myo-part";
    meta.setKinds({ [top._id]: kind, ...Object.fromEntries(created.map((s) => [s._id, partKind])) });
  };

  /** What to do next after ticking a set: keep going (drop, superset), rest a short while, or rest. */
  const announceAfterTick = (exercise: IWorkoutExercise, set: ISet) => {
    const isDone = (s: ISet) => s._id === set._id || meta.doneIds.has(s._id);
    const clusters = buildClusters(exercise, meta.kinds);
    const cluster = clusters.find((cl) => cl.sets.some((s) => s._id === set._id));
    if (!cluster) return;
    const round = roundOf(clusters, cluster);

    const position = cluster.sets.findIndex((s) => s._id === set._id);
    const nextPart = cluster.sets.slice(position + 1).find((s) => !isDone(s));
    if (nextPart && cluster.kind === "drop") {
      restCue.start(`Drop to ${formatKg(nextPart.weight)} kg now. No rest.`, 0);
      return;
    }
    if (nextPart && cluster.kind === "myo") {
      restCue.start(`Myo mini-set. Rest ${REST_SECONDS.myo} s, then go again.`, REST_SECONDS.myo);
      return;
    }
    if (!cluster.sets.every(isDone)) return;

    const block = blocks.find((b) => b.some((e) => e._id === exercise._id));
    if (block && block.length > 1) {
      const at = block.findIndex((e) => e._id === exercise._id);
      const nextExercise = block.slice(at + 1).find((e) => {
        const other = clusterInRound(buildClusters(e, meta.kinds), round);
        return other && !other.sets.every(isDone);
      });
      if (nextExercise) {
        restCue.start(`Superset: now ${nextExercise.exerciseName}. No rest.`, 0);
      } else {
        restCue.start("Round done. Rest", REST_SECONDS.work);
      }
      return;
    }
    restCue.start(
      cluster.kind === "warm" ? "Warm-up done. Rest" : "Rest",
      cluster.kind === "warm" ? REST_SECONDS.warm : REST_SECONDS.work,
    );
  };

  const handleToggleDone = (exercise: IWorkoutExercise, set: ISet) => {
    const wasDone = meta.doneIds.has(set._id);
    meta.toggleDone(set._id);
    if (!wasDone) announceAfterTick(exercise, set);
  };

  const handleSetValueChange = (setId: string, field: "reps" | "weight", value: string) => {
    setSetValueDrafts((drafts) => ({
      ...drafts,
      [setId]: {
        ...drafts[setId],
        [field]: value,
      },
    }));
  };

  const clearDraft = (setId: string) => {
    setSetValueDrafts((drafts) => {
      const rest = { ...drafts };
      delete rest[setId];
      return rest;
    });
  };

  const handleSetValueCommit = async (
    exerciseId: string,
    setId: string,
    field: "reps" | "weight",
    value: string,
  ) => {
    if (!id) return;

    const numericValue = Number(value);
    if (value === "" || !Number.isFinite(numericValue) || numericValue < 0) {
      const updated = await getMyWorkout(id);
      setWorkout(updated);
      clearDraft(setId);
      return;
    }

    const updated = await updateSet(id, exerciseId, setId, {
      [field]: numericValue,
    });
    setWorkout(updated);
    clearDraft(setId);
  };

  const handleDeleteSet = async (exerciseId: string, setId: string) => {
    if (!id) return;

    setDeletingSetId(setId);
    try {
      await deleteSet(id, exerciseId, setId);
      meta.forget([setId]);
      setWorkout((current) => {
        if (!current) return current;

        return {
          ...current,
          exercises: current.exercises.map((exercise) =>
            exercise._id === exerciseId
              ? {
                  ...exercise,
                  sets: exercise.sets.filter((set) => set._id !== setId),
                }
              : exercise,
          ),
        };
      });
    } finally {
      setDeletingSetId(null);
    }
  };

  const handleMinimize = () => {
    setLeaving(true);
    setTimeout(() => navigate("/"), 350);
  };

  const handleDiscardWorkout = async () => {
    if (!id) return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    await deleteWorkout(id);
    clearActiveWorkout();
    navigate("/");
  };

  const handleFinishWorkout = async (rating: number, saveAsTemplate: boolean) => {
    if (!id) return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    await updateWorkout(id, { rating, isTemplate: saveAsTemplate, durationSeconds: elapsedSeconds });
    clearActiveWorkout();
    navigate("/");
  };

  const handleSwipeEnd = (exercise: IWorkoutExercise, setId: string, x: number, y: number) => {
    if (!swipeStart || swipeStart.setId !== setId) return;

    const deltaX = x - swipeStart.x;
    const deltaY = Math.abs(y - swipeStart.y);
    setSwipeStart(null);

    if (deltaX > 80 && deltaY < 50) {
      void handleDeleteSet(exercise._id, setId);
    }
  };

  if (loading) {
    return <p>Loading workout...</p>;
  }

  if (!workout) {
    return (
      <div className="empty-state">
        <p>Workout not found</p>
        <button onClick={() => navigate("/")}>Back home</button>
      </div>
    );
  }

  const nextExerciseOf = (exercise: IWorkoutExercise) =>
    workout.exercises[workout.exercises.findIndex((e) => e._id === exercise._id) + 1];

  const controller: WorkoutController = {
    kinds: meta.kinds,
    doneIds: meta.doneIds,
    drafts: setValueDrafts,
    deletingSetId,
    personalBestSetIds,
    previousSets: (exerciseId) => previousByExercise.get(exerciseId) ?? [],
    changeExercises: availableExercises,
    fullExercise: (exerciseId) => exercises.find((e) => e._id === exerciseId),
    nextExercise: nextExerciseOf,
    onSwipeStart: (setId, x, y) => setSwipeStart({ setId, x, y }),
    onSwipeEnd: handleSwipeEnd,
    onSwipeCancel: () => setSwipeStart(null),
    onValueChange: handleSetValueChange,
    onValueCommit: (exercise, setId, field, value) => void handleSetValueCommit(exercise._id, setId, field, value),
    onToggleDone: handleToggleDone,
    onSetKind: (exercise, set, kind) => void handleSetKind(exercise, set, kind),
    onAddSet: (exercise, kind) => void handleAddSet(exercise, kind),
    onPairWithNext: (exercise) => {
      const next = nextExerciseOf(exercise);
      if (next) meta.link(exercise._id, next._id);
    },
    onRemoveSuperset: (exercise) => meta.unlink(exercise._id),
    onRemoveExercise: (exercise) => void handleRemoveExercise(exercise._id),
    onChangeExercise: (exercise, newExercise) => void handleChangeExercise(exercise, newExercise),
    onExerciseUpdated: (exercise, updated) => handleExerciseUpdated(exercise._id, updated),
  };

  return (
    <div className={`active-workout${leaving ? " active-workout--leaving" : ""}`}>
      <ActiveWorkoutHeader
        workoutName={workout.name}
        elapsedSeconds={elapsedSeconds}
        gym={workout.gym}
        knownGyms={knownGyms}
        onMinimize={handleMinimize}
        onWorkoutNameChange={handleWorkoutNameChange}
        onWorkoutNameCommit={handleWorkoutNameCommit}
        onGymChange={handleGymChange}
      />

      {showFinishModal && (
        <FinishWorkoutModal
          onFinish={handleFinishWorkout}
          onCancel={() => setShowFinishModal(false)}
          onDiscard={handleDiscardWorkout}
        />
      )}

      <div className="section">
        {workout.exercises.length === 0 ? (
          <div className="empty-state">
            <p>Add an exercise to start logging sets</p>
          </div>
        ) : (
          blocks.map((block) => (
            <ActiveWorkoutExercise
              key={block.map((exercise) => exercise._id).join("+")}
              exercises={block}
              controller={controller}
            />
          ))
        )}
      </div>

      <ActiveExercisePicker
        exercises={availableExercises}
        loading={exercisesLoading}
        open={exercisePickerOpen}
        exercisePbs={exercisePbs}
        onToggle={() => setExercisePickerOpen((open) => !open)}
        onSelect={handleAddExercise}
        gym={workout.gym}
        gymExerciseIds={gymExerciseIds}
      />

      {restCue.cue && <RestCue cue={restCue.cue} onStop={restCue.stop} onExtend={restCue.extend} />}

      <div className="active-workout__bottom-actions">
        <button type="button" className="btn-success" onClick={() => setShowFinishModal(true)}>
          Finish Workout
        </button>
      </div>
    </div>
  );
}
