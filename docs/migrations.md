# Database migrations

`supabase/migrations/` is the **only** source of truth for the database. Tables, indexes, constraints, Row Level Security, policies, functions, grants, triggers and the avatar bucket are all there, applied in file-name order by the Supabase CLI. Nothing is applied from anywhere else.

## Everyday commands (run from the repository root)

| Task | Command |
|---|---|
| Start the local stack (Docker) | `npm run db:start` |
| Rebuild the local database from the migrations only | `npm run db:reset` |
| Create a new migration | `npx supabase migration new <name>` |
| Regenerate the TypeScript types | `npm run db:types` |
| Run the database tests | `npm test` |
| Stop the stack | `npm run db:stop` |

The local stack is the reproducible development database. `db:reset` throws everything away and replays the migrations, so running it twice must give the same result (the schema tooling below proves it).

## The migrations

| File | What it does |
|---|---|
| `20260930000000_baseline.sql` | Everything that existed before Milestone 1, consolidated for **fresh installs**. Never replay it over an existing database. |
| `20261013000100_residual_cleanup.sql` | `IF EXISTS` drops of the old invitation model. Stops with an error if the old data structures still exist (they must be archived and converted by hand first). |
| `…000200_profile_backfill.sql` | Gives every `auth.users` row a profile (id only; no privileges inferred). |
| `…000300_indexes_constraints.sql` | Foreign-key indexes, status/value `CHECK`s, one pending admin invite per user. |
| `…000400_updated_at_triggers.sql` | `updated_at` is maintained by the database. |
| `…000500_training_access.sql` | `can_read_training()` and the four coach read policies. Admin status grants no training access. |
| `…000600_relationship_lifecycle.sql` | `ended` / `cancelled`, `end_relationship`, `cancel_invite`, conditional re-open in `invite_client`, no direct deletes. |
| `…000700_programme_retention.sql` | Delivered programmes cannot be deleted; `send_program` locks the programme row. |
| `…000800_exercise_ownership.sql` | Global catalogue plus private exercises, integrity triggers. |
| `…000900_legacy_import_map.sql` | Bookkeeping table for the MongoDB import. |
| `…001000_grants_hardening.sql` | Least-privilege grants. |

## Rules

1. **Never edit a migration that has been applied anywhere shared.** Fix things with a new, forward migration. The baseline is the one exception to "history is replayed": it stands in for the old history on fresh installs only.
2. **Every table in `public` has Row Level Security enabled in the same migration that creates it.** The tests fail otherwise. Default privileges on Supabase hand new tables to `anon`/`authenticated`, so RLS is the protection.
3. **Say who can do what in the same migration**: policies, and `grant`/`revoke` for tables that are only written through functions.
4. **`SECURITY DEFINER` functions** pin `search_path` (`set search_path = ''` and schema-qualified names for new code), derive the caller from `auth.uid()`, and `revoke … from public, anon` / `grant execute … to authenticated`. Never accept a caller-supplied identity as proof of authorization.
5. **Destructive changes need an explicit data plan** (archive or convert first). A migration that cannot be safe on existing data should stop with a clear error rather than guess, as `residual_cleanup` and `exercise_ownership` do.
6. After changing the schema run `npm run db:reset`, `npm run db:types` and `npm test`, and commit the regenerated `packages/database/src/database.types.ts`.

## Proving two databases are the same

`db/tools/schema-snapshot.ts` writes a normalised JSON description of everything the application owns (tables, columns, constraints, indexes, functions with their definition and ACL, policies including `storage.objects`, triggers including the one on `auth.users`, default and schema ACLs, types, bucket rows) and diffs two snapshots.

```
npx tsx db/tools/schema-snapshot.ts snapshot out.json            # local database
npx tsx db/tools/schema-snapshot.ts snapshot out.json --url … --remote   # any other database, read-only
npx tsx db/tools/schema-snapshot.ts diff a.json b.json
```

It is how the baseline was shown to match a database upgraded through the old scripts (`db/tools/legacy-replay.ts` replays those scripts from git history), and how a hosted project is compared before its migration history is repaired.

## The hosted project

Local work never touches it. Putting the migrations on the shared hosted dev project is a separate, deliberate step:

1. Take a read-only look first (`db/tools/inspect-hosted.ts`) and snapshot it with `schema-snapshot.ts … --remote`.
2. Compare it with a snapshot of the local baseline. Explain any difference; do not paper over drift.
3. Only then mark the baseline as already applied (`supabase migration repair --status applied 20260930000000`) so the CLI does not try to replay it, and `supabase db push` the follow-up migrations.
4. Never run a reset against it.

An existing database that is on the old model must go through `residual_cleanup`'s checks and the profile/exercise checks before the later migrations; they are written to stop rather than lose data.
