# Importing and reconciling the old MongoDB history

The workout history from before Supabase still lives in MongoDB Atlas. The Express/Mongo server that wrote it was removed on 2026-10-01; only this import and the Atlas data remain. **MongoDB is only ever read.**

Two tools in `db/legacy/`:

- `import-mongo.ts` copies the history into Postgres **for one named user**.
- `reconcile-mongo.ts` compares the source with what was imported, record by record.

Both default to the **local** Supabase database. Pointing them at another database needs `--remote` (which uses `DATABASE_URL` in `db/.env`) and, by agreement, an explicit go-ahead first.

## What the import guarantees

- **Dry run by default.** Nothing is written without `--apply`.
- **Explicit owner.** `--owner <username>` must be an existing user; everything is imported for them. Imported exercises become that user's **private** exercises. The old single profile only fills blank name/age fields; the old avatar URL points at a server that no longer exists and is not imported (the files are in `legacy-uploads/`).
- **Idempotent.** Every source record (profile, exercises, workouts, logged exercises, sets) is recorded in `legacy_import_map` under a stable source id (`mongo:<host>/<database>`, never credentials; nested records are qualified with their parents). A rerun skips what is already imported.
- **Never overwrites.** If a source record changed after it was imported, or was imported for a different user, or its imported row has been deleted, the run reports it and stops. It does not guess.
- **Atomic units.** The profile and the exercise catalogue commit together with their mappings. Each workout commits together with its exercises, sets and mappings. A crash rolls back only the unit in progress; rerunning continues without duplicates.
- **One at a time.** An advisory lock stops two imports of the same source running together.
- **Nothing silently dropped.** Orphaned exercise references, invalid reps/weights/dates/names, base-exercise cycles and duplicate ids are errors. With errors present `--apply` refuses to write (except that `--skip-invalid` still imports the *valid* workouts). The exit code is non-zero whenever an error remains.
- **Timestamps.** Workouts and exercises keep their `createdAt`/`updatedAt` when the source has them. Logged exercises and sets have no timestamps in the source and there is no position column, so their order is preserved with synthetic `created_at` values (workout time + 1 ms per position).

## Procedure

1. **Dry run against a fresh local database.**
   `npm run db:reset`, create the owner account (sign up in the app or the Supabase dashboard of the local stack), then
   `npx tsx db/legacy/import-mongo.ts --owner <username>`
   Read the counts and fix or accept every issue.
2. **Apply.** `npx tsx db/legacy/import-mongo.ts --owner <username> --apply`
3. **Reconcile.** `npx tsx db/legacy/reconcile-mongo.ts --owner <username>`
   It checks every exercise, workout, logged exercise and set (names, values, order, identity of the exercise behind each logged exercise, base-exercise links, timestamps) and then counts, total volume (Σ reps × weight) and the date range. Equal totals alone are not trusted. Any difference prints and exits non-zero.
4. **Repeat and interrupt.** Run the apply again: it must create 0 rows. The test suite also interrupts an import part-way and checks the retry completes without duplicates or unmapped rows (`db/tests/legacy-import.test.ts`).
5. **Spot-check in the app** (sign in as the owner against the local stack): History, a workout's detail, Exercises, personal bests.
6. **Hosted dev project.** Only with an explicit go-ahead: repeat steps 1–4 with `--remote`.
7. **Retire the Atlas database** only after reconciliation is signed off on the target that will be kept.

## What has been verified so far

- **Fixture tests (the tools):** deterministic fixture, no Mongo server — dry run writes nothing; apply; reconcile finds nothing; second run creates nothing; injected crash then retry; concurrent runs; lock held elsewhere; changed source, other owner, missing target, orphans, invalid values; reconcile detecting a changed set, a missing set, a swapped exercise and vanished records. See `db/tests/legacy-import.test.ts`.
- **The real history (2026-10-13), into a local database only:** 1 profile, 9 exercises, 5 workouts, 14 logged exercises, 29 sets. Dry run clean; applied; reconciled with no differences (volume 25,350 on both sides; 2026-07-05 → 2026-07-17); a second apply created nothing. Nothing has been imported into any hosted database.
