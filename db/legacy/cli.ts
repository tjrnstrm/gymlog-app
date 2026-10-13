// Shared command-line plumbing for the legacy tools: argument parsing and the database target.
import 'dotenv/config';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export interface Args {
  flags: Set<string>;
  options: Map<string, string>;
}

export function parseArgs(argv: string[], valueOptions: string[]): Args {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    if (valueOptions.includes(a)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${a} needs a value`);
      options.set(a, value);
      i += 1;
    } else {
      flags.add(a);
    }
  }
  return { flags, options };
}

/** The local Supabase database by default. A non-local database needs --remote and DATABASE_URL. */
export function connect(args: Args, log: (line: string) => void = console.log) {
  const remote = args.flags.has('--remote');
  const url = remote ? process.env.DATABASE_URL : (process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_URL);
  if (!url) throw new Error('--remote needs DATABASE_URL in db/.env');
  const host = new URL(url).hostname;
  const isLocal = LOCAL_HOSTS.has(host);
  if (!isLocal && !remote) throw new Error(`Refusing to use ${host} without --remote.`);
  log(`Database: ${host}${isLocal ? ' (local)' : ' (REMOTE)'}`);
  return postgres(url, { max: 4, onnotice: () => {}, prepare: false, connect_timeout: 15 });
}

export function mongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI in db/.env');
  return uri;
}
