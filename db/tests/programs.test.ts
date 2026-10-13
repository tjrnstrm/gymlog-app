// Programmes: who sees what, delivered-programme retention, and concurrent assignment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminApi, cleanup, createUser, grantCoachPlan, makeAdmin, makeSql, setLink } from './helpers/world.ts';
import type { Client, Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let coach: TestUser;
let otherCoach: TestUser;
let clientA: TestUser;
let clientB: TestUser;
let stranger: TestUser;

const draft = { name: 'Push/Pull', days: [{ name: 'Day 1', exercises: [{ name: 'Bench press', sets: '3', reps: '8' }] }] };

async function newProgram(by: Client = coach.client, program = draft): Promise<string> {
  const { data, error } = await by.rpc('save_program', { p: program });
  expect(error).toBeNull();
  return data as string;
}

beforeAll(async () => {
  sql = makeSql();
  coach = await createUser('coach');
  otherCoach = await createUser('coach2');
  clientA = await createUser('clienta');
  clientB = await createUser('clientb');
  stranger = await createUser('stranger');
  await grantCoachPlan(sql, coach.id);
  await grantCoachPlan(sql, otherCoach.id);
  await setLink(sql, coach.id, clientA.id, 'accepted');
  await setLink(sql, coach.id, clientB.id, 'accepted');
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe('visibility', () => {
  it('the coach sees their programmes; clients only see ones sent to them; others see nothing', async () => {
    const id = await newProgram();
    expect((await coach.client.from('programs').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await clientA.client.from('programs').select('id').eq('id', id)).data).toHaveLength(0);

    expect((await coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: 'go' })).error).toBeNull();
    expect((await clientA.client.from('programs').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await clientA.client.from('program_days').select('id').eq('program_id', id)).data).toHaveLength(1);
    for (const nobody of [clientB, stranger, otherCoach]) {
      expect((await nobody.client.from('programs').select('id').eq('id', id)).data).toHaveLength(0);
      expect((await nobody.client.from('program_days').select('id').eq('program_id', id)).data).toHaveLength(0);
    }
  });

  it('only a coach with an active plan can save, send or duplicate programmes', async () => {
    const r = await stranger.client.rpc('save_program', { p: draft });
    expect(r.error?.message).toMatch(/Coach access required/);
  });

  it('sending needs an accepted link', async () => {
    const id = await newProgram();
    const r = await coach.client.rpc('send_program', { p_program: id, p_client_id: stranger.id, p_message: '' });
    expect(r.error?.message).toMatch(/hasn't accepted/);
  });
});

describe('delivered programmes are retained', () => {
  it('a draft can be deleted by its coach, another coach cannot', async () => {
    const id = await newProgram();
    await otherCoach.client.from('programs').delete().eq('id', id);
    expect(await sql`select 1 from public.programs where id = ${id}`).toHaveLength(1);

    const del = await coach.client.from('programs').delete().eq('id', id).select('id');
    expect(del.data).toHaveLength(1);
  });

  it('a sent programme can not be deleted through the API', async () => {
    const id = await newProgram();
    await coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: '' });
    const del = await coach.client.from('programs').delete().eq('id', id).select('id');
    expect(del.data ?? []).toHaveLength(0);
    expect(await sql`select 1 from public.programs where id = ${id}`).toHaveLength(1);
  });

  it('a sent programme can not be deleted even on a direct connection without the explicit override', async () => {
    const id = await newProgram();
    await coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: '' });
    await expect(sql`delete from public.programs where id = ${id}`).rejects.toThrow(/can not be deleted/);
  });

  it('deleting the coach\'s account is blocked while they have delivered programmes', async () => {
    const owner = await createUser('owner');
    await grantCoachPlan(sql, owner.id);
    await setLink(sql, owner.id, clientA.id, 'accepted');
    const id = await newProgram(owner.client);
    await owner.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: '' });

    const { error } = await adminApi().auth.admin.deleteUser(owner.id);
    expect(error).not.toBeNull();
    expect(await sql`select 1 from public.profiles where id = ${owner.id}`).toHaveLength(1);
    expect(await sql`select 1 from public.programs where id = ${id}`).toHaveLength(1);
  });

  it('a coach with only drafts can be deleted, and the drafts go with them', async () => {
    const owner = await createUser('draftonly');
    await grantCoachPlan(sql, owner.id);
    const id = await newProgram(owner.client);
    expect((await adminApi().auth.admin.deleteUser(owner.id)).error).toBeNull();
    expect(await sql`select 1 from public.programs where id = ${id}`).toHaveLength(0);
  });

  it('the operator override works on a direct connection only', async () => {
    const id = await newProgram();
    await coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: '' });
    await sql.begin(async (tx) => {
      await tx`select set_config('app.allow_delivered_programme_delete', 'on', true)`;
      await tx`delete from public.programs where id = ${id}`;
    });
    expect(await sql`select 1 from public.programs where id = ${id}`).toHaveLength(0);
  });

  it('an ended relationship does not take delivered programmes away from the client', async () => {
    const solo = await createUser('soloclient');
    await setLink(sql, coach.id, solo.id, 'accepted');
    const id = await newProgram();
    await coach.client.rpc('send_program', { p_program: id, p_client_id: solo.id, p_message: '' });
    const [{ id: linkId }] = await sql`select id from public.coach_client_links where coach_id = ${coach.id} and client_id = ${solo.id}`;
    expect((await solo.client.rpc('end_relationship', { p_link_id: linkId })).error).toBeNull();

    expect((await solo.client.from('programs').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await solo.client.from('program_exercises').select('id, program_days!inner(program_id)').eq('program_days.program_id', id)).data).toHaveLength(1);
  });
});

describe('sending one programme to two clients at once', () => {
  it('exactly one send wins, every time', async () => {
    for (let round = 0; round < 6; round += 1) {
      const id = await newProgram();
      const results = await Promise.all([
        coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: 'a' }),
        coach.client.rpc('send_program', { p_program: id, p_client_id: clientB.id, p_message: 'b' }),
      ]);
      const winners = results.filter((r) => r.error === null);
      expect(winners).toHaveLength(1);
      const loser = results.find((r) => r.error);
      expect(loser?.error?.message).toMatch(/already sent to someone else/);

      const [row] = await sql`select client_id, status, message from public.programs where id = ${id}`;
      expect(row.status).toBe('sent');
      const expected = results[0].error === null ? { client: clientA.id, message: 'a' } : { client: clientB.id, message: 'b' };
      expect(row.client_id).toBe(expected.client);
      expect(row.message).toBe(expected.message);
    }
  });

  it('sending to the same client twice is fine', async () => {
    const id = await newProgram();
    const results = await Promise.all([
      coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: 'x' }),
      coach.client.rpc('send_program', { p_program: id, p_client_id: clientA.id, p_message: 'x' }),
    ]);
    expect(results.every((r) => r.error === null)).toBe(true);
  });
});

describe('admin invitations', () => {
  it('parallel duplicate admin invitations leave exactly one pending invite', async () => {
    const admin = await createUser('admin');
    await makeAdmin(sql, admin.id);
    for (let round = 0; round < 5; round += 1) {
      const invitee = await createUser(`inv${round}`);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => admin.client.rpc('admin_invite_admin', { p_username: invitee.username })),
      );
      expect(results.filter((r) => r.error === null).length).toBeGreaterThanOrEqual(1);
      const [{ n }] = await sql`
        select count(*)::int as n from public.admin_invites where invited_user_id = ${invitee.id} and status = 'pending'`;
      expect(n).toBe(1);
    }
  });

  it('the database itself refuses a second pending invite', async () => {
    const invitee = await createUser('dbdup');
    await sql`insert into public.admin_invites (invited_user_id) values (${invitee.id})`;
    await expect(sql`insert into public.admin_invites (invited_user_id) values (${invitee.id})`).rejects.toThrow(
      /admin_invites_one_pending_per_user/,
    );
    // a decided invite does not block a new one
    await sql`update public.admin_invites set status = 'declined' where invited_user_id = ${invitee.id}`;
    await sql`insert into public.admin_invites (invited_user_id) values (${invitee.id})`;
  });
});
