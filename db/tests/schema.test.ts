// Structural invariants of the database, checked against the live local schema.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, createUser, makeSql, seedTraining } from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let user: TestUser;

beforeAll(async () => {
  sql = makeSql();
  user = await createUser('schema');
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe('Row Level Security', () => {
  it('is enabled on every table in public', async () => {
    const rows = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('every table that signed-in users can write to has at least one policy', async () => {
    const rows = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege('authenticated', c.oid, 'insert, update, delete')
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe('privileges', () => {
  it('signed-out users have no table privileges in public', async () => {
    const rows = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger'))`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('signed-in users cannot truncate or reference tables', async () => {
    const rows = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege('authenticated', c.oid, 'truncate, references, trigger')`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('the import map and the function-only tables are not reachable through the API', async () => {
    for (const table of ['legacy_import_map', 'admin_invites', 'coach_access_requests', 'coach_subscriptions']) {
      const { error } = await user.client.from(table as 'admin_invites').select('*');
      expect(error, table).not.toBeNull();
    }
    expect((await anonClient().from('legacy_import_map' as 'admin_invites').select('*')).error).not.toBeNull();
  });

  it('signed-out users can only call username_available among the application functions', async () => {
    const rows = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;
    expect(rows.map((r) => r.proname)).toEqual(['username_available']);
  });

  it('trigger functions cannot be called through the API', async () => {
    const rows = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`;
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('every security-definer function pins its search_path', async () => {
    const rows = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`;
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('the new helpers use an empty search_path', async () => {
    const rows = await sql`
      select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('can_read_training', 'exercise_visible_via_training', 'check_workout_exercise_owner',
                          'check_exercise_base', 'admin_create_global_exercise', 'set_updated_at', 'block_delivered_programme_delete')`;
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.proconfig, r.proname).toContain('search_path=""');
  });
});

describe('profiles', () => {
  it('the update privilege is limited to the safe columns', async () => {
    const rows = await sql`
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', 'public.profiles', a.attname, 'update')
      order by a.attname`;
    expect(rows.map((r) => r.attname)).toEqual(['age', 'avatar_url', 'bio', 'coach_tags', 'name']);
  });

  it('every auth user has a profile (the backfill is idempotent and the trigger covers new users)', async () => {
    const [{ n }] = await sql`select count(*)::int as n from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)`;
    expect(n).toBe(0);
  });
});

describe('updated_at', () => {
  it('moves on update and ignores a client-supplied value', async () => {
    const t = await seedTraining(sql, user.id);
    const [before] = await sql`select updated_at from public.workouts where id = ${t.workoutId}`;
    await new Promise((r) => setTimeout(r, 20));

    const { error } = await user.client
      .from('workouts')
      .update({ name: 'renamed', updated_at: '2001-01-01T00:00:00Z' })
      .eq('id', t.workoutId);
    expect(error).toBeNull();
    const [after] = await sql`select updated_at, name from public.workouts where id = ${t.workoutId}`;
    expect(after.name).toBe('renamed');
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('does not move when nothing changed', async () => {
    const t = await seedTraining(sql, user.id);
    const [before] = await sql`select updated_at from public.workouts where id = ${t.workoutId}`;
    await sql`update public.workouts set name = name where id = ${t.workoutId}`;
    const [after] = await sql`select updated_at from public.workouts where id = ${t.workoutId}`;
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it('exists on profiles, exercises, programs and workouts', async () => {
    const rows = await sql`
      select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'set_updated_at' and not t.tgisinternal order by c.relname`;
    expect(rows.map((r) => r.relname)).toEqual(['exercises', 'profiles', 'programs', 'workouts']);
  });
});
