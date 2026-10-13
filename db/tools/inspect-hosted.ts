// Read-only inspection of the hosted Supabase project (Milestone 1, step 2).
//   npx tsx tools/inspect-hosted.ts
//
// Everything runs inside one `BEGIN READ ONLY` transaction, so it cannot change anything,
// and nothing secret is printed (only the project ref, host and server version).
import 'dotenv/config';
import postgres from 'postgres';

const { DATABASE_URL, SUPABASE_URL } = process.env;
if (!DATABASE_URL || !SUPABASE_URL) throw new Error('Missing DATABASE_URL or SUPABASE_URL in db/.env');

const dbUrl = new URL(DATABASE_URL);
const refFromApiUrl = new URL(SUPABASE_URL).hostname.split('.')[0];
// Pooler connections log in as "postgres.<project ref>"; direct connections as plain "postgres".
const refFromDbUser = decodeURIComponent(dbUrl.username).split('.')[1] ?? null;

console.log('== identity');
console.log({
  apiProjectRef: refFromApiUrl,
  dbUserProjectRef: refFromDbUser,
  refsMatch: refFromDbUser === null ? 'n/a (direct connection)' : refFromDbUser === refFromApiUrl,
  dbHost: dbUrl.host,
});

const sql = postgres(DATABASE_URL, { connect_timeout: 15, prepare: false, max: 1 });

try {
  await sql.begin('read only', async (tx) => {
    const [id] = await tx`
      select current_database() as db, current_user as role,
             current_setting('server_version') as server_version,
             current_setting('transaction_read_only') as read_only`;
    console.log('\n== server');
    console.log(id);

    console.log('\n== extensions');
    console.log((await tx`select extname, extversion from pg_extension order by extname`).map((r) => `${r.extname} ${r.extversion}`).join(', '));

    console.log('\n== row counts (public base tables + auth/storage)');
    const tables = await tx`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const [row] = await tx`select count(*)::int as n from public.${tx(t.table_name)}`;
      counts[`public.${t.table_name}`] = row.n;
    }
    for (const [schema, table] of [['auth', 'users'], ['auth', 'identities'], ['storage', 'buckets'], ['storage', 'objects']] as const) {
      try {
        const [row] = await tx`select count(*)::int as n from ${tx(schema)}.${tx(table)}`;
        counts[`${schema}.${table}`] = row.n;
      } catch (err) {
        counts[`${schema}.${table}`] = -1;
        console.log(`  (could not count ${schema}.${table}: ${(err as Error).message})`);
      }
    }
    console.log(counts);

    console.log('\n== data checks that matter for the forward migrations');
    const [noProfile] = await tx`
      select count(*)::int as n from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)`;
    console.log('auth users without a profile:', noProfile.n);

    const hasTable = async (name: string) =>
      (await tx`select to_regclass(${`public.${name}`}) as r`)[0].r !== null;

    if (await hasTable('coach_client_links')) {
      console.log('coach_client_links by status:', await tx`select status, count(*)::int as n from public.coach_client_links group by 1 order by 1`);
      console.log('coach_client_links with an unexpected status:', (await tx`
        select count(*)::int as n from public.coach_client_links where status not in ('pending', 'accepted', 'declined')`)[0].n);
    }
    if (await hasTable('admin_invites')) {
      console.log('admin_invites by status:', await tx`select status, count(*)::int as n from public.admin_invites group by 1 order by 1`);
      console.log('invitees with more than one pending admin invite:', (await tx`
        select count(*)::int as n from (select invited_user_id from public.admin_invites where status = 'pending'
                                        group by 1 having count(*) > 1) d`)[0].n);
    }
    if (await hasTable('programs')) {
      console.log('programs by status:', await tx`select status, count(*)::int as n from public.programs group by 1 order by 1`);
      console.log('sent programs without a client:', (await tx`select count(*)::int as n from public.programs where status = 'sent' and client_id is null`)[0].n);
    }
    if (await hasTable('coach_subscriptions')) {
      console.log('coach_subscriptions by source:', await tx`select source, count(*)::int as n from public.coach_subscriptions group by 1 order by 1`);
    }
    console.log('sets with negative reps or weight:', (await tx`select count(*)::int as n from public.sets where reps < 0 or weight < 0`)[0].n);
    console.log('exercises (need an ownership decision if > 0):', (await tx`select count(*)::int as n from public.exercises`)[0].n);
    console.log('workout_exercises referencing a missing exercise:', (await tx`
      select count(*)::int as n from public.workout_exercises we
      where not exists (select 1 from public.exercises e where e.id = we.exercise_id)`)[0].n);

    console.log('\n== migration history tables');
    console.log({
      'supabase_migrations.schema_migrations': (await tx`select to_regclass('supabase_migrations.schema_migrations') as r`)[0].r !== null,
      'public.__drizzle_migrations': (await tx`select to_regclass('public.__drizzle_migrations') as r`)[0].r !== null,
      'drizzle.__drizzle_migrations': (await tx`select to_regclass('drizzle.__drizzle_migrations') as r`)[0].r !== null,
    });

    console.log('\n== avatars bucket (data, not schema)');
    console.log(await tx`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`);
  });
} finally {
  await sql.end({ timeout: 2 });
}
