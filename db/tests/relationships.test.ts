// Coach <-> client relationship lifecycle: invite, accept/decline/cancel, end, re-open.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listClientWorkouts } from '@bro-split/database';
import {
  cleanup,
  createUser,
  grantCoachPlan,
  makeSql,
  revokeCoachPlan,
  seedTraining,
  setLink,
} from './helpers/world.ts';
import type { Sql, TestUser } from './helpers/world.ts';

let sql: Sql;
let coach: TestUser;
let client: TestUser;
let stranger: TestUser;

const link = async (coachId: string, clientId: string) => {
  const [row] = await sql`
    select id, status, accepted_at, ended_at, ended_by from public.coach_client_links
    where coach_id = ${coachId} and client_id = ${clientId}`;
  return row;
};

beforeAll(async () => {
  sql = makeSql();
  coach = await createUser('coach');
  client = await createUser('client');
  stranger = await createUser('stranger');
  await grantCoachPlan(sql, coach.id);
});

afterAll(async () => {
  await cleanup(sql);
  await sql.end({ timeout: 2 });
});

describe('lifecycle', () => {
  it('invite -> pending; a repeat invite is refused while pending', async () => {
    expect((await coach.client.rpc('invite_client', { p_username: `@${client.username}` })).error).toBeNull();
    expect((await link(coach.id, client.id)).status).toBe('pending');

    const again = await coach.client.rpc('invite_client', { p_username: client.username });
    expect(again.error?.message).toMatch(/already invited/);
  });

  it('only the invited client can answer; a stranger and the coach cannot', async () => {
    const { id } = await link(coach.id, client.id);
    for (const other of [stranger, coach]) {
      const r = await other.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true });
      expect(r.error?.message).toMatch(/not found/i);
    }
    expect((await link(coach.id, client.id)).status).toBe('pending');
  });

  it('accept -> accepted; repeating the same answer is a harmless no-op', async () => {
    const { id } = await link(coach.id, client.id);
    expect((await client.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true })).error).toBeNull();
    const first = await link(coach.id, client.id);
    expect(first.status).toBe('accepted');

    expect((await client.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true })).error).toBeNull();
    const second = await link(coach.id, client.id);
    expect(second.accepted_at).toEqual(first.accepted_at);
  });

  it('the opposite answer after the fact is an error', async () => {
    const { id } = await link(coach.id, client.id);
    const r = await client.client.rpc('respond_to_invite', { p_link_id: id, p_accept: false });
    expect(r.error?.message).toMatch(/no longer pending/);
    expect((await link(coach.id, client.id)).status).toBe('accepted');
  });

  it('my_coaches tells the client when coaching started and includes the coach photo field', async () => {
    const { data, error } = await client.client.rpc('my_coaches');
    expect(error).toBeNull();
    const mine = (data ?? []).find((r) => r.username === coach.username);
    expect(mine).toMatchObject({ status: 'accepted' });
    expect(mine?.accepted_at).not.toBeNull();
    expect(mine).toHaveProperty('avatar_url');
  });

  it('the accepted coach can read the client\'s workouts', async () => {
    await seedTraining(sql, client.id);
    expect((await listClientWorkouts(coach.client, client.id)).length).toBeGreaterThan(0);
  });

  it('a stranger cannot end somebody else\'s relationship', async () => {
    const { id } = await link(coach.id, client.id);
    const r = await stranger.client.rpc('end_relationship', { p_link_id: id });
    expect(r.error?.message).toMatch(/not found/i);
    expect((await link(coach.id, client.id)).status).toBe('accepted');
  });

  it('either party can end it; access stops immediately; the row is kept with who/when', async () => {
    const { id } = await link(coach.id, client.id);
    expect((await client.client.rpc('end_relationship', { p_link_id: id })).error).toBeNull();
    const ended = await link(coach.id, client.id);
    expect(ended.status).toBe('ended');
    expect(ended.ended_by).toBe(client.id);
    expect(ended.ended_at).not.toBeNull();

    expect(await listClientWorkouts(coach.client, client.id)).toEqual([]);
  });

  it('ending again (by the other party) is a no-op that keeps the first record', async () => {
    const { id } = await link(coach.id, client.id);
    const before = await link(coach.id, client.id);
    expect((await coach.client.rpc('end_relationship', { p_link_id: id })).error).toBeNull();
    const after = await link(coach.id, client.id);
    expect(after.ended_by).toBe(before.ended_by);
    expect(after.ended_at).toEqual(before.ended_at);
  });

  it('re-inviting an ended link re-opens it as pending and needs fresh acceptance', async () => {
    expect((await coach.client.rpc('invite_client', { p_username: client.username })).error).toBeNull();
    const reopened = await link(coach.id, client.id);
    expect(reopened).toMatchObject({ status: 'pending', accepted_at: null, ended_at: null, ended_by: null });
    // pending is not access
    expect(await listClientWorkouts(coach.client, client.id)).toEqual([]);

    const { id } = reopened;
    expect((await client.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true })).error).toBeNull();
    expect((await listClientWorkouts(coach.client, client.id)).length).toBeGreaterThan(0);
  });

  it('only an accepted relationship can be ended', async () => {
    const other = await createUser('other');
    await setLink(sql, coach.id, other.id, 'pending');
    const { id } = await link(coach.id, other.id);
    const r = await coach.client.rpc('end_relationship', { p_link_id: id });
    expect(r.error?.message).toMatch(/Only an accepted/);
  });
});

describe('cancelling and declining', () => {
  it('the coach can cancel a pending invite; repeating is a no-op; a stranger cannot', async () => {
    const target = await createUser('target');
    await coach.client.rpc('invite_client', { p_username: target.username });
    const { id } = await link(coach.id, target.id);

    expect((await stranger.client.rpc('cancel_invite', { p_link_id: id })).error?.message).toMatch(/not found/i);
    expect((await target.client.rpc('cancel_invite', { p_link_id: id })).error?.message).toMatch(/not found/i);
    expect((await link(coach.id, target.id)).status).toBe('pending');

    expect((await coach.client.rpc('cancel_invite', { p_link_id: id })).error).toBeNull();
    expect((await link(coach.id, target.id)).status).toBe('cancelled');
    expect((await coach.client.rpc('cancel_invite', { p_link_id: id })).error).toBeNull();

    // the client can no longer accept it
    const accept = await target.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true });
    expect(accept.error?.message).toMatch(/no longer pending/);
  });

  it('a cancelled or declined invite can be sent again', async () => {
    const target = await createUser('target2');
    await coach.client.rpc('invite_client', { p_username: target.username });
    const { id } = await link(coach.id, target.id);
    expect((await target.client.rpc('respond_to_invite', { p_link_id: id, p_accept: false })).error).toBeNull();
    expect((await link(coach.id, target.id)).status).toBe('declined');
    // declining twice is fine
    expect((await target.client.rpc('respond_to_invite', { p_link_id: id, p_accept: false })).error).toBeNull();

    expect((await coach.client.rpc('invite_client', { p_username: target.username })).error).toBeNull();
    expect((await link(coach.id, target.id)).status).toBe('pending');
  });

  it('only accepted/pending links cannot be cancelled once accepted', async () => {
    const { id } = await link(coach.id, client.id); // accepted again from the lifecycle test
    const r = await coach.client.rpc('cancel_invite', { p_link_id: id });
    expect(r.error?.message).toMatch(/Only a pending/);
  });
});

describe('expired coach plans', () => {
  it('either party can still end the relationship and the coach can cancel invites', async () => {
    const lapsed = await createUser('lapsed');
    const c1 = await createUser('c1');
    const c2 = await createUser('c2');
    await grantCoachPlan(sql, lapsed.id);
    const accepted = await setLink(sql, lapsed.id, c1.id, 'accepted');
    const pending = await setLink(sql, lapsed.id, c2.id, 'pending');
    await revokeCoachPlan(sql, lapsed.id);

    expect((await lapsed.client.rpc('end_relationship', { p_link_id: accepted })).error).toBeNull();
    expect((await lapsed.client.rpc('cancel_invite', { p_link_id: pending })).error).toBeNull();
    // but cannot start new invitations
    expect((await lapsed.client.rpc('invite_client', { p_username: c1.username })).error?.message).toMatch(/Coach access required/);
  });
});

describe('links are no longer deletable through the API', () => {
  it('neither party can delete a link directly', async () => {
    const { id } = await link(coach.id, client.id);
    expect((await coach.client.from('coach_client_links').delete().eq('id', id)).error).not.toBeNull();
    expect((await client.client.from('coach_client_links').delete().eq('id', id)).error).not.toBeNull();
    expect(await link(coach.id, client.id)).toBeDefined();
  });

  it('and cannot insert or update links directly either', async () => {
    const { id } = await link(coach.id, client.id);
    expect((await coach.client.from('coach_client_links').insert({ coach_id: coach.id, client_id: stranger.id, status: 'accepted' })).error).not.toBeNull();
    expect((await client.client.from('coach_client_links').update({ status: 'accepted' }).eq('id', id)).error).not.toBeNull();
    expect((await link(coach.id, client.id)).status).toBe('accepted');
  });
});

describe('concurrency', () => {
  it('parallel duplicate invitations create exactly one link and exactly one succeeds', async () => {
    for (let round = 0; round < 5; round += 1) {
      const target = await createUser(`dup${round}`);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => coach.client.rpc('invite_client', { p_username: target.username })),
      );
      const succeeded = results.filter((r) => r.error === null).length;
      expect(succeeded).toBe(1);
      for (const r of results.filter((x) => x.error)) expect(r.error?.message).toMatch(/already invited/);

      const [{ n }] = await sql`
        select count(*)::int as n from public.coach_client_links where coach_id = ${coach.id} and client_id = ${target.id}`;
      expect(n).toBe(1);
    }
  });

  it('parallel re-invitations of an ended link reopen it exactly once', async () => {
    const target = await createUser('reopen');
    await setLink(sql, coach.id, target.id, 'ended');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => coach.client.rpc('invite_client', { p_username: target.username })),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect((await link(coach.id, target.id)).status).toBe('pending');
  });

  it('answering and cancelling at the same moment leaves one consistent outcome', async () => {
    const target = await createUser('race');
    await coach.client.rpc('invite_client', { p_username: target.username });
    const { id } = await link(coach.id, target.id);
    const [accept, cancel] = await Promise.all([
      target.client.rpc('respond_to_invite', { p_link_id: id, p_accept: true }),
      coach.client.rpc('cancel_invite', { p_link_id: id }),
    ]);
    const status = (await link(coach.id, target.id)).status;
    expect(['accepted', 'cancelled']).toContain(status);
    // exactly one of the two actions won; the other either failed or was a no-op consistent with the result
    if (status === 'accepted') expect(cancel.error).not.toBeNull();
    if (status === 'cancelled') expect(accept.error).not.toBeNull();
  });
});
