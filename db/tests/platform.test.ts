// The platform security model end to end: usernames, the coach paywall, invites by @username,
// programmes and the admin area. These are the cases of the old smoke test, now against the local
// stack and as ordinary assertions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, createUser, makeAdmin, makeSql, runId } from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let admin: TestUser;
let coach: TestUser;
let client: TestUser;
let stranger: TestUser;

const fullProgram = {
  name: 'Bro Split',
  days: [
    {
      name: 'Chest',
      exercises: [
        { name: 'Bench press', sets: '4', reps: '6–8', rest: '2–3 min', feeder: '2 sets', comment: 'Pause on chest', link: 'https://example.com/v' },
        { name: 'Cable fly', sets: '3', reps: '12–15' },
      ],
    },
    { name: 'Back', exercises: [{ name: 'Barbell row', sets: '4', reps: '8' }] },
  ],
};

beforeAll(async () => {
  sql = makeSql();
  admin = await createUser('admin');
  coach = await createUser('coach');
  client = await createUser('client');
  stranger = await createUser('stranger');
  await makeAdmin(sql, admin.id);
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe('usernames', () => {
  it('username_available is callable signed out and is case-insensitive', async () => {
    const anon = anonClient();
    expect((await anon.rpc('username_available', { p_username: `t${runId}_free_name` })).data).toBe(true);
    expect((await anon.rpc('username_available', { p_username: admin.username.toUpperCase() })).data).toBe(false);
  });

  it('set_username refuses to change a name that is already set, and bad formats', async () => {
    expect((await coach.client.rpc('set_username', { p_username: `t${runId}_new` })).error?.message).toMatch(/already set/);

    // a user without a username can pick a valid one but not an invalid one
    const nameless = await createUser('nameless');
    await sql`update public.profiles set username = null where id = ${nameless.id}`;
    expect((await nameless.client.rpc('set_username', { p_username: 'no' })).error?.message).toMatch(/3–20/);
    expect((await nameless.client.rpc('set_username', { p_username: `t${runId}_picked` })).error).toBeNull();
  });

  it('a user cannot rewrite their username directly', async () => {
    const { error } = await client.client.from('profiles').update({ username: 'hijack' }).eq('id', client.id);
    expect(error).not.toBeNull();
  });

  it('a user can still edit their own name and bio, and cannot edit someone else', async () => {
    expect((await client.client.from('profiles').update({ name: 'Client', bio: 'hi' }).eq('id', client.id)).error).toBeNull();
    const other = await client.client.from('profiles').update({ name: 'pwned' }).eq('id', stranger.id).select();
    expect(other.data ?? []).toHaveLength(0);
  });
});

describe('the coach paywall', () => {
  it('without a plan, coaching functions are refused', async () => {
    expect((await client.client.rpc('invite_client', { p_username: coach.username })).error?.message).toMatch(/Coach access required/);
    expect((await client.client.rpc('save_program', { p: { name: 'x', days: [] } })).error?.message).toMatch(/Coach access required/);
  });

  it('subscriptions, links and admin data cannot be written or read directly', async () => {
    expect((await client.client.from('coach_subscriptions').insert({ user_id: client.id, source: 'granted' })).error).not.toBeNull();
    expect((await client.client.from('coach_client_links').insert({ coach_id: client.id, client_id: stranger.id })).error).not.toBeNull();
    expect((await client.client.from('coach_subscriptions').select('*')).error).not.toBeNull();
  });

  it('only admins can use the admin functions', async () => {
    expect((await client.client.rpc('admin_overview')).error?.message).toMatch(/Admins only/);
    expect((await client.client.rpc('admin_grant_coach', { p_username: client.username })).error?.message).toMatch(/Admins only/);
    expect((await client.client.rpc('admin_list_users', { p_search: '' })).error?.message).toMatch(/Admins only/);
    expect((await admin.client.rpc('admin_overview')).error).toBeNull();
  });

  it('a signed-out caller cannot use any of it', async () => {
    const anon = anonClient();
    expect((await anon.rpc('admin_overview')).error).not.toBeNull();
    expect((await anon.rpc('invite_client', { p_username: 'x' })).error).not.toBeNull();
    expect((await anon.rpc('my_access')).error).not.toBeNull();
  });

  it('an admin can grant coach access; the coach appears in the directory and in admin lists', async () => {
    expect((await admin.client.rpc('admin_grant_coach', { p_username: `@${coach.username}` })).error).toBeNull();
    expect((await coach.client.rpc('my_access')).data).toMatchObject({ coach: true });
    expect(((await admin.client.rpc('admin_list_users', { p_search: coach.username })).data ?? [])[0]).toMatchObject({
      username: coach.username,
      coach_active: true,
      coach_source: 'granted',
    });
    const directory = await client.client.rpc('list_coaches');
    expect((directory.data ?? []).some((c) => c.username === coach.username)).toBe(true);
  });
});

describe('invitations by @username', () => {
  it('rejects unknown usernames and self-invites; tolerates case and the @ sign', async () => {
    expect((await coach.client.rpc('invite_client', { p_username: '@nobody_here_xyz' })).error?.message).toMatch(/No user/);
    expect((await coach.client.rpc('invite_client', { p_username: coach.username })).error?.message).toMatch(/yourself/);
    expect((await coach.client.rpc('invite_client', { p_username: `@${client.username.toUpperCase()}` })).error).toBeNull();
    expect((await coach.client.rpc('invite_client', { p_username: client.username })).error?.message).toMatch(/already invited/);
  });

  it('the client sees the pending invite, and the coach sees the client', async () => {
    const mine = await client.client.rpc('my_coaches');
    const link = (mine.data ?? []).find((r) => r.username === coach.username);
    expect(link?.status).toBe('pending');
    const clients = await coach.client.rpc('my_clients');
    expect((clients.data ?? []).find((r) => r.username === client.username)?.status).toBe('pending');
  });

  it('only the client can accept it, and until then the coach reads nothing', async () => {
    const mine = await client.client.rpc('my_coaches');
    const link = (mine.data ?? []).find((r) => r.username === coach.username)!;
    expect((await stranger.client.rpc('respond_to_invite', { p_link_id: link.id, p_accept: true })).error).not.toBeNull();
    expect((await coach.client.rpc('respond_to_invite', { p_link_id: link.id, p_accept: true })).error).not.toBeNull();

    await sql`insert into public.workouts (user_id, name, date) values (${client.id}, 'Secret workout', now())`;
    expect((await coach.client.from('workouts').select('id').eq('user_id', client.id)).data).toHaveLength(0);

    expect((await client.client.rpc('respond_to_invite', { p_link_id: link.id, p_accept: true })).error).toBeNull();
    expect((await coach.client.from('workouts').select('id').eq('user_id', client.id)).data).toHaveLength(1);
    expect((await stranger.client.from('workouts').select('id').eq('user_id', client.id)).data).toHaveLength(0);
  });
});

describe('programmes', () => {
  let programId: string;

  it('links must be http(s)', async () => {
    const bad = await coach.client.rpc('save_program', {
      p: { name: 'Bad', days: [{ name: 'D', exercises: [{ name: 'X', link: 'javascript:alert(1)' }] }] },
    });
    expect(bad.error?.message).toMatch(/http/);
  });

  it('a coach saves, re-saves and duplicates a programme', async () => {
    const saved = await coach.client.rpc('save_program', { p: fullProgram });
    expect(saved.error).toBeNull();
    programId = saved.data as string;

    const full = await coach.client
      .from('programs')
      .select('name, program_days(name, position, program_exercises(name, position, rest, feeder, comment, link))')
      .eq('id', programId)
      .single();
    expect(full.data?.program_days).toHaveLength(2);
    const chest = full.data!.program_days.find((d) => d.name === 'Chest')!;
    expect(chest.program_exercises).toHaveLength(2);
    expect(chest.program_exercises[0]).toMatchObject({ name: 'Bench press', rest: '2–3 min', comment: 'Pause on chest', link: 'https://example.com/v' });

    const resave = await coach.client.rpc('save_program', {
      p: { id: programId, name: 'Bro Split v2', days: [{ name: 'Chest', exercises: [{ name: 'Bench press', sets: '4', reps: '6–8' }] }] },
    });
    expect(resave.error).toBeNull();
    const [row] = await sql`select name, (select count(*)::int from public.program_days where program_id = ${programId}) as days from public.programs where id = ${programId}`;
    expect(row).toMatchObject({ name: 'Bro Split v2', days: 1 });

    expect((await coach.client.rpc('duplicate_program', { p_program: programId })).error).toBeNull();
  });

  it('a draft is invisible to the client; sending to a stranger is refused; sending to the client works', async () => {
    expect((await client.client.from('programs').select('id').eq('id', programId)).data).toHaveLength(0);
    expect((await coach.client.rpc('send_program', { p_program: programId, p_client_id: stranger.id, p_message: '' })).error).not.toBeNull();
    expect((await coach.client.rpc('send_program', { p_program: programId, p_client_id: client.id, p_message: 'Enjoy' })).error).toBeNull();

    const read = await client.client
      .from('programs')
      .select('name, message, program_days(name, program_exercises(name))')
      .eq('id', programId)
      .single();
    expect(read.data).toMatchObject({ message: 'Enjoy' });
    expect(read.data?.program_days[0].program_exercises[0].name).toBe('Bench press');
    expect((await stranger.client.from('programs').select('id').eq('id', programId)).data).toHaveLength(0);
  });

  it('the client cannot edit the programme or its days', async () => {
    const edit = await client.client.from('programs').update({ name: 'mine now' }).eq('id', programId);
    expect(edit.error).not.toBeNull();
    const days = await client.client.from('program_days').delete().eq('program_id', programId);
    expect(days.error).not.toBeNull();
    const [row] = await sql`select name from public.programs where id = ${programId}`;
    expect(row.name).toBe('Bro Split v2');
  });

  it('a sent programme cannot be re-sent to a different person', async () => {
    const r = await coach.client.rpc('send_program', { p_program: programId, p_client_id: coach.id, p_message: '' });
    expect(r.error).not.toBeNull();
  });
});

describe('revoking coach access closes the paywall again', () => {
  it('a revoked coach can no longer save programmes, read client workouts or be listed', async () => {
    expect((await admin.client.rpc('admin_revoke_coach', { p_username: coach.username })).error).toBeNull();
    expect((await coach.client.rpc('save_program', { p: { name: 'Nope', days: [] } })).error).not.toBeNull();
    expect((await coach.client.from('workouts').select('id').eq('user_id', client.id)).data).toHaveLength(0);
    const directory = await client.client.rpc('list_coaches');
    expect((directory.data ?? []).some((c) => c.username === coach.username)).toBe(false);
  });

  it('only admin-granted access can be revoked', async () => {
    const r = await admin.client.rpc('admin_revoke_coach', { p_username: coach.username });
    expect(r.error?.message).toMatch(/Only admin-granted/);
  });
});

describe('coach requests and admin invitations', () => {
  it('a user can request coach access and the admin sees it', async () => {
    expect((await stranger.client.rpc('request_coach_access')).error).toBeNull();
    const listed = await admin.client.rpc('admin_list_users', { p_search: stranger.username });
    expect(listed.data?.[0]?.requested).toBe(true);
  });

  it('admin invites admin: duplicates refused, non-admins refused, accepting makes an admin', async () => {
    expect((await admin.client.rpc('admin_invite_admin', { p_username: stranger.username })).error).toBeNull();
    expect((await admin.client.rpc('admin_invite_admin', { p_username: stranger.username })).error?.message).toMatch(/Already invited/);
    expect((await client.client.rpc('admin_invite_admin', { p_username: client.username })).error).not.toBeNull();

    expect((await stranger.client.rpc('my_access')).data).toMatchObject({ admin_invite: true });
    expect((await stranger.client.rpc('respond_admin_invite', { p_accept: true })).error).toBeNull();
    expect((await stranger.client.rpc('admin_overview')).error).toBeNull();
  });

  it('an admin cannot remove themselves but can remove another admin', async () => {
    expect((await admin.client.rpc('admin_remove_admin', { p_username: admin.username })).error?.message).toMatch(/yourself/);
    expect((await admin.client.rpc('admin_remove_admin', { p_username: stranger.username })).error).toBeNull();
    expect((await stranger.client.rpc('admin_overview')).error).not.toBeNull();
  });
});
