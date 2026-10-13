// Replays, against an EMPTY local Supabase database, the SQL that was historically applied to
// the hosted project, in the order it was applied (reconstructed from git history).
//
// Why: the hosted dev project may be unreachable or unverifiable. This reproduces its most likely
// state (including objects created by scripts that have since been deleted from the repository),
// so a fresh baseline can be compared with an "upgraded" database. It is evidence tooling, not part
// of the migration process.
//
//   npx tsx tools/legacy-replay.ts
//
// Refuses to run against anything but a local database that has no application tables yet.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

const LOCAL_URL = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// commit = the commit that holds the version of the file that was applied.
const STEPS: { commit: string; file: string; note: string }[] = [
  { commit: 'e5db49c', file: 'db/migrations/0000_chubby_marvel_apes.sql', note: 'tables (hosted used drizzle-kit push, same result)' },
  { commit: 'e5db49c', file: 'db/rls.sql', note: 'RLS for the core tables' },
  { commit: 'e5db49c', file: 'db/storage.sql', note: 'avatars bucket and policies' },
  { commit: 'e5db49c', file: 'db/migrations/0001_ambiguous_riptide.sql', note: 'coach_client_links' },
  { commit: 'e5db49c', file: 'db/coach-client.sql', note: 'first coach-client policies and accept_coach_invite (since deleted)' },
  { commit: 'e5db49c', file: 'db/user-provisioning.sql', note: 'first handle_new_user trigger (since deleted)' },
  { commit: 'e5db49c', file: 'db/invite-preview.sql', note: 'get_pending_invite (since deleted)' },
  { commit: 'e5db49c', file: 'db/migrations/0002_striped_komodo.sql', note: 'coach_invites' },
  { commit: 'e5db49c', file: 'db/coach-invites.sql', note: 'coach invite functions (since deleted)' },
  { commit: 'db46d45', file: 'db/client-sees-coach.sql', note: 'client reads coach profile (since deleted)' },
  { commit: '6c672dc', file: 'db/migrations/0003_classy_stepford_cuckoos.sql', note: 'drops coach_invites, role, email/token' },
  { commit: '6c672dc', file: 'db/migrations/0004_needy_sersi.sql', note: 'usernames, programs, subscriptions, admin invites' },
  { commit: '6c672dc', file: 'db/platform.sql', note: 'platform security model' },
];

const target = new URL(LOCAL_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) throw new Error('Local databases only.');

const sql = postgres(LOCAL_URL, { connect_timeout: 15, prepare: false, max: 1 });
try {
  const [{ present }] = await sql`select to_regclass('public.profiles') is not null as present`;
  if (present) throw new Error('public.profiles already exists; run `supabase db reset` on an empty migrations folder first.');

  for (const step of STEPS) {
    const text = execFileSync('git', ['show', `${step.commit}:${step.file}`], { encoding: 'utf8', maxBuffer: 10_000_000 });
    // Drizzle's statement separators are comments; the file is plain multi-statement SQL.
    await sql.unsafe(text);
    console.log(`applied ${step.file} @${step.commit}  (${step.note})`);
  }
  console.log('Legacy replay complete.');
} finally {
  await sql.end({ timeout: 2 });
}
