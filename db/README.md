# db

Everything around the database that is not the schema itself. **The schema lives in [`../supabase/migrations`](../supabase/migrations)** and is applied by the Supabase CLI; see [`../docs/migrations.md`](../docs/migrations.md) for the process.

## The model in one paragraph

Anyone can sign up (with a unique `@username`). **Coach tools are paywalled in the database**: a user has coach access only while they have a row in `coach_subscriptions` (created by an admin today, by payments later). **Clients are free.** A coach invites a client by `@username`; the client accepts or declines. A coach reads an accepted client's training data (read-only) while the plan is active and the relationship has not ended. A coach builds a **programme** and sends it to one accepted client; delivered programmes cannot be deleted. **Admins** grant/revoke coach access, invite other admins and manage the global exercise catalogue; admin status gives **no** access to anyone's training data. Exercises are a global catalogue plus each user's private entries. Everything coach/admin related goes through `security definer` functions that check who is calling.

## Local setup

Needs Docker and Node.

```
npm install                 # from the repository root (npm workspaces)
npm run db:start            # local Supabase stack
npm run db:reset            # build the database from supabase/migrations
npm test                    # authorization, lifecycle, retention, concurrency, import tests
```

The tests only run against the local stack: keys come from `supabase status`, nothing is printed, and a non-local address is refused.

## What is here

- `tests/` — Vitest suites against the local stack. Fixtures are unique per run and cleaned up.
- `legacy/` — the MongoDB import and reconciliation (`npm run import-mongo -- --owner <username>`; see [`../docs/mongo-reconciliation.md`](../docs/mongo-reconciliation.md)).
- `tools/` — `schema-snapshot` (prove two databases match), `legacy-replay` (evidence for the baseline), `inspect-hosted` (read-only look at a hosted project).
- `make-admin.ts`, `find-user.ts` — operator helpers. They use `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `.env`, so check which project that points at before running them. After signing up, `npm run make-admin <username>` makes the first admin; from then on admins invite admins at `/admin/team`.
