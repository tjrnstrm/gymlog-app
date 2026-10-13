// Matching the exercise names of a coach's programme to the user's own exercise catalogue.
// Programmes only carry names (stable exercise ids arrive with the M2 data model), so name matching
// has to be careful: it may only reuse a catalogue entry that is unambiguous.

export interface CatalogEntry {
  id: string;
  name: string;
  /** Part of the shared catalogue (as opposed to the user's own). Only used to tell options apart. */
  isGlobal?: boolean;
}

export type NameResolution =
  /** Exactly one eligible entry has this name: use it. */
  | { kind: 'match'; exerciseId: string }
  /** Several eligible entries share this name: the user has to choose, never guess. */
  | { kind: 'ambiguous'; options: CatalogEntry[] }
  /** Nothing eligible has this name: create a private entry. */
  | { kind: 'create' };

/** Names match when they are equal after trimming, collapsing inner whitespace and lower-casing. */
export const normalizeExerciseName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * `catalog` must be the user's ELIGIBLE catalogue (global entries plus their own, as returned by
 * listMyCatalogExercises). Passing everything RLS lets a coach read would let a client's private
 * entry be matched.
 */
export function resolveExerciseName(name: string, catalog: readonly CatalogEntry[]): NameResolution {
  const wanted = normalizeExerciseName(name);
  const matches = catalog.filter((entry) => normalizeExerciseName(entry.name) === wanted);
  if (matches.length === 1) return { kind: 'match', exerciseId: matches[0].id };
  if (matches.length > 1) return { kind: 'ambiguous', options: matches.map((m) => ({ ...m })) };
  return { kind: 'create' };
}

/** Resolution per distinct (normalised) name in a programme day. */
export function resolveProgramExercises(
  names: readonly string[],
  catalog: readonly CatalogEntry[],
): Map<string, NameResolution> {
  const out = new Map<string, NameResolution>();
  names.forEach((name) => {
    const key = normalizeExerciseName(name);
    if (!out.has(key)) out.set(key, resolveExerciseName(name, catalog));
  });
  return out;
}
