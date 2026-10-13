import { useCallback, useState } from 'react';
import type { SetKind } from '../lib/setTypes';

/**
 * What the database does not store yet about a workout in progress: which sets are ticked, what kind
 * each set is (warm-up, drop, myo-reps) and which exercises form a superset. It is kept in this
 * browser per workout, so it survives minimising the workout and reloading the page, but it does not
 * follow you to another device and is not part of your history. The data model milestone replaces it.
 */
interface Meta {
  done: string[];
  kinds: Record<string, SetKind>;
  groups: Record<string, string>;
}

const EMPTY: Meta = { done: [], kinds: {}, groups: {} };
const storageKey = (workoutId: string) => `bs-workout-meta:${workoutId}`;

function load(workoutId: string | undefined): Meta {
  if (!workoutId) return EMPTY;
  try {
    const raw = localStorage.getItem(storageKey(workoutId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Meta>;
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      kinds: parsed.kinds ?? {},
      groups: parsed.groups ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export function useWorkoutMeta(workoutId: string | undefined) {
  const [store, setStore] = useState(() => ({ id: workoutId, meta: load(workoutId) }));
  // Switching to another workout loads its own metadata (adjusting state during render).
  if (store.id !== workoutId) setStore({ id: workoutId, meta: load(workoutId) });
  const meta = store.id === workoutId ? store.meta : EMPTY;

  const update = useCallback((change: (meta: Meta) => Meta) => {
    setStore((current) => {
      const next = change(current.meta);
      if (current.id) {
        try {
          localStorage.setItem(storageKey(current.id), JSON.stringify(next));
        } catch {
          /* private mode or storage full: the state still works for this session */
        }
      }
      return { ...current, meta: next };
    });
  }, []);

  const toggleDone = useCallback(
    (setId: string) =>
      update((m) => ({ ...m, done: m.done.includes(setId) ? m.done.filter((id) => id !== setId) : [...m.done, setId] })),
    [update],
  );
  const setDone = useCallback(
    (setIds: string[], done: boolean) =>
      update((m) => ({ ...m, done: done ? [...new Set([...m.done, ...setIds])] : m.done.filter((id) => !setIds.includes(id)) })),
    [update],
  );
  const setKinds = useCallback((kinds: Record<string, SetKind>) => update((m) => ({ ...m, kinds: { ...m.kinds, ...kinds } })), [update]);
  const forget = useCallback(
    (setIds: string[]) =>
      update((m) => {
        const kinds = { ...m.kinds };
        for (const id of setIds) delete kinds[id];
        return { ...m, kinds, done: m.done.filter((id) => !setIds.includes(id)) };
      }),
    [update],
  );
  const link = useCallback(
    (a: string, b: string) =>
      update((m) => {
        const group = m.groups[a] ?? m.groups[b] ?? `g${Date.now()}`;
        return { ...m, groups: { ...m.groups, [a]: group, [b]: group } };
      }),
    [update],
  );
  const unlink = useCallback(
    (exerciseId: string) =>
      update((m) => {
        const group = m.groups[exerciseId];
        if (!group) return m;
        return { ...m, groups: Object.fromEntries(Object.entries(m.groups).filter(([, g]) => g !== group)) };
      }),
    [update],
  );

  return { doneIds: new Set(meta.done), kinds: meta.kinds, groups: meta.groups, toggleDone, setDone, setKinds, forget, link, unlink };
}
