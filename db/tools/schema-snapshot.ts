// Normalised snapshot of everything the application owns in a Postgres/Supabase database,
// plus a diff between two snapshots. Used to prove that a fresh baseline reproduces another
// database (a hosted project, or a database upgraded through the legacy scripts).
//
//   npx tsx tools/schema-snapshot.ts snapshot <out.json> [--url <postgres url>] [--remote]
//   npx tsx tools/schema-snapshot.ts diff <a.json> <b.json> [--full]
//
// * Default target is the local Supabase database. Anything that is not 127.0.0.1/localhost
//   needs --remote (and is only ever read inside a READ ONLY transaction).
// * Column order is deliberately not captured: dropped columns leave gaps on upgraded
//   databases, and order has no semantic meaning here.
// * Secrets are never printed; only the host is logged.
import 'dotenv/config';
import fs from 'node:fs';
import postgres from 'postgres';

const LOCAL_URL = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function sortDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]));
  }
  return value;
}

const sortedAcl = (acl: string[] | null): string[] | null => (acl ? [...acl].sort() : null);

async function takeSnapshot(url: string, remote: boolean): Promise<Json> {
  const target = new URL(url);
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(target.hostname);
  if (!isLocalHost && !remote) throw new Error(`Refusing to read ${target.host} without --remote`);
  console.log(`Reading ${target.host} (${isLocalHost ? 'local' : 'REMOTE, read-only'})`);

  const sql = postgres(url, { connect_timeout: 15, prepare: false, max: 1 });
  try {
    return await sql.begin('read only', async (tx) => {
      const [version] = await tx`select current_setting('server_version_num')::int / 10000 as major`;

      const tables = await tx`
        select c.relname as name, c.relkind::text as kind, c.relrowsecurity as rls,
               c.relforcerowsecurity as force_rls, pg_get_userbyid(c.relowner) as owner, c.relacl::text[] as acl
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')`;

      const columns = await tx`
        select c.relname as tbl, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
               a.attnotnull as not_null, pg_get_expr(d.adbin, d.adrelid) as "default",
               a.attidentity::text as identity, a.attgenerated::text as generated, a.attacl::text[] as acl
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped`;

      const constraints = await tx`
        select c.relname as tbl, con.conname as name, con.contype::text as type, pg_get_constraintdef(con.oid) as def
        from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'`;

      const indexes = await tx`
        select tablename as tbl, indexname as name, indexdef as def from pg_indexes where schemaname = 'public'`;

      const functions = await tx`
        select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as def,
               p.prosecdef as security_definer, p.proconfig as config, p.proacl::text[] as acl,
               pg_get_userbyid(p.proowner) as owner, p.provolatile::text as volatility, p.prokind::text as kind
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;

      const policies = await tx`
        select schemaname as schema, tablename as tbl, policyname as name, permissive, roles::text[] as roles,
               cmd, qual, with_check
        from pg_policies
        where schemaname = 'public' or (schemaname = 'storage' and tablename in ('objects', 'buckets'))`;

      const triggers = await tx`
        select n.nspname as schema, c.relname as tbl, t.tgname as name, pg_get_triggerdef(t.oid) as def,
               t.tgenabled::text as enabled
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal
          and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users') or n.nspname = 'storage')`;

      const defaultAcl = await tx`
        select pg_get_userbyid(defaclrole) as role, defaclnamespace::regnamespace::text as schema,
               defaclobjtype::text as objtype, defaclacl::text[] as acl
        from pg_default_acl`;

      const schemaAcl = await tx`
        select nspname as name, nspacl::text[] as acl from pg_namespace where nspname in ('public', 'auth', 'storage')`;

      const types = await tx`
        select t.typname as name, t.typtype::text as type from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typtype in ('e', 'd')`;

      const extensions = await tx`select extname as name, extversion as version from pg_extension`;

      const buckets = await tx`
        select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`;

      type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const withAcl = (rows: readonly Row[]): Row[] => rows.map((r) => ({ ...r, acl: sortedAcl(r.acl) }));
      const keyed = (rows: readonly Row[], key: (r: Row) => string): Json =>
        Object.fromEntries(rows.map((r) => [key(r), r])) as Json;

      const snapshot: Json = {
        meta: { postgresMajor: version.major },
        tables: keyed(withAcl(tables), (r) => r.name),
        columns: keyed(withAcl(columns), (r) => `${r.tbl}.${r.name}`),
        constraints: keyed(constraints, (r) => `${r.tbl}.${r.name}`),
        indexes: keyed(indexes, (r) => `${r.tbl}.${r.name}`),
        functions: keyed(withAcl(functions), (r) => r.signature),
        policies: keyed(
          policies.map((p) => ({ ...p, roles: [...(p.roles as string[])].sort() })),
          (r) => `${r.schema}.${r.tbl}.${r.name}`,
        ),
        triggers: keyed(triggers, (r) => `${r.schema}.${r.tbl}.${r.name}`),
        defaultAcl: keyed(withAcl(defaultAcl), (r) => `${r.role}.${r.schema}.${r.objtype}`),
        schemaAcl: keyed(withAcl(schemaAcl), (r) => r.name),
        types: keyed(types, (r) => r.name),
        extensions: keyed(extensions, (r) => r.name),
        buckets: keyed(buckets, (r) => r.id),
      };
      return sortDeep(snapshot);
    });
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/* ------------------------------ diff ------------------------------ */

const SECTIONS_PLATFORM_OWNED = new Set(['extensions']); // reported, but expected to differ between platforms

function shorten(value: Json, full: boolean): string {
  const text = JSON.stringify(value);
  return full || text.length <= 360 ? text : `${text.slice(0, 360)}…(${text.length} chars)`;
}

function firstLineDifferences(a: string, b: string, limit = 6): string[] {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(aLines.length, bLines.length) && out.length < limit; i += 1) {
    if (aLines[i] !== bLines[i]) out.push(`      line ${i + 1}: A=${JSON.stringify(aLines[i] ?? null)}  B=${JSON.stringify(bLines[i] ?? null)}`);
  }
  return out;
}

function diffSnapshots(a: Json, b: Json, full: boolean): number {
  let differences = 0;
  const sectionsA = a as Record<string, Json>;
  const sectionsB = b as Record<string, Json>;
  for (const section of [...new Set([...Object.keys(sectionsA), ...Object.keys(sectionsB)])].sort()) {
    const left = (sectionsA[section] ?? {}) as Record<string, Json>;
    const right = (sectionsB[section] ?? {}) as Record<string, Json>;
    const lines: string[] = [];
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (!(key in left)) lines.push(`  + only in B: ${key}`);
      else if (!(key in right)) lines.push(`  - only in A: ${key}`);
      else if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
        lines.push(`  ~ different: ${key}`);
        const l = left[key] as Record<string, Json>;
        const r = right[key] as Record<string, Json>;
        if (l && r && typeof l === 'object' && typeof r === 'object') {
          for (const field of [...new Set([...Object.keys(l), ...Object.keys(r)])].sort()) {
            if (JSON.stringify(l[field]) === JSON.stringify(r[field])) continue;
            if (field === 'def' && typeof l[field] === 'string' && typeof r[field] === 'string') {
              lines.push(`    ${field}:`, ...firstLineDifferences(l[field] as string, r[field] as string));
            } else {
              lines.push(`    ${field}: A=${shorten(l[field] ?? null, full)}  B=${shorten(r[field] ?? null, full)}`);
            }
          }
        }
      }
    }
    if (lines.length === 0) {
      console.log(`[${section}] identical`);
    } else {
      const platform = SECTIONS_PLATFORM_OWNED.has(section) ? ' (platform-owned, informational)' : '';
      console.log(`[${section}]${platform}`);
      console.log(lines.join('\n'));
      if (!SECTIONS_PLATFORM_OWNED.has(section)) differences += lines.filter((l) => /^ {2}[+~-]/.test(l)).length;
    }
  }
  return differences;
}

/* ------------------------------ cli ------------------------------ */

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(name);
const option = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positionals = rest.filter((x, i) => !x.startsWith('--') && rest[i - 1] !== '--url');

if (command === 'snapshot') {
  const out = positionals[0];
  if (!out) throw new Error('Usage: schema-snapshot.ts snapshot <out.json> [--url <url>] [--remote]');
  const snapshot = await takeSnapshot(option('--url') ?? LOCAL_URL, flag('--remote'));
  fs.mkdirSync(new URL(`file:///${out.replace(/\\/g, '/')}`).pathname.replace(/\/[^/]*$/, ''), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  const counts = Object.entries(snapshot as Record<string, Record<string, Json>>)
    .filter(([k]) => k !== 'meta')
    .map(([k, v]) => `${k}:${Object.keys(v).length}`)
    .join(' ');
  console.log(`Wrote ${out}\n  ${counts}`);
} else if (command === 'diff') {
  const [fileA, fileB] = positionals;
  if (!fileA || !fileB) throw new Error('Usage: schema-snapshot.ts diff <a.json> <b.json> [--full]');
  const count = diffSnapshots(JSON.parse(fs.readFileSync(fileA, 'utf8')), JSON.parse(fs.readFileSync(fileB, 'utf8')), flag('--full'));
  console.log(count === 0 ? '\nNo differences in application-owned objects.' : `\n${count} difference(s) in application-owned objects.`);
  process.exit(count === 0 ? 0 : 1);
} else {
  throw new Error('Usage: schema-snapshot.ts <snapshot|diff> ...');
}
