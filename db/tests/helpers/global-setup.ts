// Reads the local Supabase stack's connection details once and hands them to the test files.
// Refuses anything that is not a local stack, and never prints a key.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

export interface TestEnv {
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceKey: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    env: TestEnv;
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export default function setup(project: TestProject) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

  let raw: string;
  try {
    raw = execSync('npx --no-install supabase status -o env', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Could not read the local Supabase status. Start the local stack first: npm run db:start');
  }

  const vars = parseEnv(raw);
  const apiUrl = vars.API_URL;
  const dbUrl = vars.DB_URL;
  const anonKey = vars.ANON_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY;
  if (!apiUrl || !dbUrl || !anonKey || !serviceKey) {
    throw new Error('The local Supabase status is missing API_URL, DB_URL, ANON_KEY or SERVICE_ROLE_KEY.');
  }
  for (const [what, value] of [['API_URL', apiUrl], ['DB_URL', dbUrl]] as const) {
    if (!LOCAL_HOSTS.has(new URL(value).hostname)) {
      throw new Error(`Refusing to run the tests: ${what} is not a local address.`);
    }
  }

  project.provide('env', { apiUrl, dbUrl, anonKey, serviceKey });
}
