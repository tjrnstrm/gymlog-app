// Signup creates a profile; avatar upload/read/delete works for the owner only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, createUser, makeSql, runId } from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
const signedUp: string[] = [];

beforeAll(() => {
  sql = makeSql();
});

afterAll(async () => {
  await cleanup(sql, signedUp);
  await sql.end({ timeout: 2 });
});

describe('signup', () => {
  async function signUp(label: string, username?: string) {
    const anon = anonClient();
    const email = `t${runId}_${label}@bro-split.test`;
    const { data, error } = await anon.auth.signUp({
      email,
      password: 'Test-passw0rd!',
      options: { data: username === undefined ? {} : { username } },
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    signedUp.push(id);
    return id;
  }

  it('creates a profile with the chosen username and no special rights', async () => {
    const username = `s${runId}_ok`;
    const id = await signUp('ok', username);
    const [p] = await sql`select username, is_admin from public.profiles where id = ${id}`;
    expect(p).toMatchObject({ username, is_admin: false });
    expect(await sql`select 1 from public.coach_subscriptions where user_id = ${id}`).toHaveLength(0);
  });

  it('signup metadata can not grant admin or coach rights', async () => {
    const anon = anonClient();
    const { data } = await anon.auth.signUp({
      email: `t${runId}_evil@bro-split.test`,
      password: 'Test-passw0rd!',
      options: { data: { username: `s${runId}_evil`, is_admin: true, role: 'coach' } },
    });
    signedUp.push(data.user!.id);
    const [p] = await sql`select is_admin from public.profiles where id = ${data.user!.id}`;
    expect(p.is_admin).toBe(false);
    expect(await sql`select 1 from public.coach_subscriptions where user_id = ${data.user!.id}`).toHaveLength(0);
  });

  it('an invalid username still creates the account, without a username', async () => {
    const id = await signUp('bad', 'no spaces allowed!');
    const [p] = await sql`select username from public.profiles where id = ${id}`;
    expect(p.username).toBeNull();
  });

  it('a taken username still creates the account, without a username', async () => {
    const username = `s${runId}_dup`;
    await signUp('dup1', username);
    const id = await signUp('dup2', username);
    const [p] = await sql`select username from public.profiles where id = ${id}`;
    expect(p.username).toBeNull();
  });

  it('username_available works signed out', async () => {
    const anon = anonClient();
    expect((await anon.rpc('username_available', { p_username: `s${runId}_ok` })).data).toBe(false);
    expect((await anon.rpc('username_available', { p_username: `s${runId}_free` })).data).toBe(true);
  });
});

describe('avatars', () => {
  let alice: TestUser;
  let bob: TestUser;
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });

  beforeAll(async () => {
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  it('the owner uploads, anyone can read it through the public URL, the owner deletes it', async () => {
    const path = `${alice.id}/avatar-${runId}.png`;
    const up = await alice.client.storage.from('avatars').upload(path, png(), { contentType: 'image/png', upsert: true });
    expect(up.error).toBeNull();

    const { data } = anonClient().storage.from('avatars').getPublicUrl(path);
    expect((await fetch(data.publicUrl)).status).toBe(200);

    const del = await alice.client.storage.from('avatars').remove([path]);
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
    expect((await fetch(data.publicUrl)).status).not.toBe(200);
  });

  it("nobody can write into, overwrite or delete somebody else's folder", async () => {
    const path = `${alice.id}/protected-${runId}.png`;
    expect((await alice.client.storage.from('avatars').upload(path, png(), { contentType: 'image/png' })).error).toBeNull();

    const intrude = await bob.client.storage.from('avatars').upload(`${alice.id}/intruder-${runId}.png`, png(), { contentType: 'image/png' });
    expect(intrude.error).not.toBeNull();
    const overwrite = await bob.client.storage.from('avatars').upload(path, png(), { contentType: 'image/png', upsert: true });
    expect(overwrite.error).not.toBeNull();
    const del = await bob.client.storage.from('avatars').remove([path]);
    expect(del.data ?? []).toHaveLength(0);

    const anon = await anonClient().storage.from('avatars').upload(`${alice.id}/anon-${runId}.png`, png(), { contentType: 'image/png' });
    expect(anon.error).not.toBeNull();

    // the original is untouched
    const { data } = anonClient().storage.from('avatars').getPublicUrl(path);
    expect((await fetch(data.publicUrl)).status).toBe(200);
    await alice.client.storage.from('avatars').remove([path]);
  });

  it('the avatars bucket is the public bucket the policies expect', async () => {
    const [bucket] = await sql`select id, public from storage.buckets where id = 'avatars'`;
    expect(bucket).toMatchObject({ id: 'avatars', public: true });
  });
});
