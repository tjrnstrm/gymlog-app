import type { ISet, IWorkoutExercise } from '../types/Workout';

/**
 * A "set" in the table can be a cluster of rows:
 *   work / warm   one row
 *   drop          the top set, then lower-weight parts (no rest between them)
 *   myo           an activation set, then short mini-sets at the same weight
 * Each row is a normal set in the database; the kind of each row is kept on this device (see
 * useWorkoutMeta) until the data model stores it.
 */
export type SetKind = 'work' | 'warm' | 'drop' | 'myo' | 'drop-part' | 'myo-part';
export type ClusterKind = 'work' | 'warm' | 'drop' | 'myo';

export interface Cluster {
  kind: ClusterKind;
  sets: ISet[];
  /** 1, 2, 3 for working sets (warm-ups are not numbered). */
  number: number | null;
}

export const isPart = (kind: SetKind): boolean => kind === 'drop-part' || kind === 'myo-part';

/** Seconds of rest after a finished set, by kind. A per-exercise or coach-set rest replaces the default later. */
export const REST_SECONDS = { work: 90, warm: 30, myo: 20 } as const;

export const snapWeight = (kg: number): number => Math.max(0, Math.round(kg / 2.5) * 2.5);

export function buildClusters(exercise: IWorkoutExercise, kinds: Record<string, SetKind>): Cluster[] {
  const out: Cluster[] = [];
  let number = 0;
  for (const set of exercise.sets) {
    const kind = kinds[set._id] ?? 'work';
    const last = out[out.length - 1];
    if (isPart(kind) && last && (last.kind === 'drop' || last.kind === 'myo')) {
      last.sets.push(set);
      continue;
    }
    const clusterKind: ClusterKind = isPart(kind) ? 'work' : (kind as ClusterKind);
    if (clusterKind !== 'warm') number += 1;
    out.push({ kind: clusterKind, sets: [set], number: clusterKind === 'warm' ? null : number });
  }
  return out;
}

/**
 * Superset rounds line up by working set: all warm-ups first, then round 1, round 2, and so on, so a
 * warm-up on one exercise never shifts it out of step with the other.
 */
export interface Round {
  warm: boolean;
  index: number;
}

export function roundOf(clusters: Cluster[], cluster: Cluster): Round {
  const warm = cluster.kind === 'warm';
  return { warm, index: clusters.filter((c) => (c.kind === 'warm') === warm).indexOf(cluster) };
}

export function clusterInRound(clusters: Cluster[], round: Round): Cluster | undefined {
  return clusters.filter((c) => (c.kind === 'warm') === round.warm)[round.index];
}

/** Adjacent exercises that share a superset group id are shown (and logged) together. */
export function buildBlocks(exercises: IWorkoutExercise[], groups: Record<string, string>): IWorkoutExercise[][] {
  const blocks: IWorkoutExercise[][] = [];
  for (const exercise of exercises) {
    const group = groups[exercise._id];
    const last = blocks[blocks.length - 1];
    if (group && last && groups[last[last.length - 1]._id] === group) last.push(exercise);
    else blocks.push([exercise]);
  }
  return blocks;
}

export interface RowLabel {
  text: string;
  /** Small marker after the number: D for a drop set, M for myo-reps. */
  tag?: string;
}

export function rowLabel(cluster: Cluster, partIndex: number, letter = ''): RowLabel {
  if (partIndex > 0) return { text: cluster.kind === 'drop' ? '↳' : '·' };
  if (cluster.kind === 'warm') return { text: `W${letter}` };
  return {
    text: `${cluster.number}${letter}`,
    tag: cluster.kind === 'drop' ? 'D' : cluster.kind === 'myo' ? 'M' : undefined,
  };
}

/** The rows to add after a set when it becomes a drop set or myo-reps. */
export function partsFor(kind: 'drop' | 'myo', top: { reps: number; weight: number }): { reps: number; weight: number }[] {
  if (kind === 'drop') {
    return [
      { reps: top.reps, weight: snapWeight(top.weight * 0.8) },
      { reps: top.reps, weight: snapWeight(top.weight * 0.6) },
    ];
  }
  return [4, 4, 4].map((reps) => ({ reps, weight: top.weight }));
}
