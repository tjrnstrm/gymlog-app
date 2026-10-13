import { supabase } from '../lib/supabaseClient';
import { normalizeUsername } from './username';
import type { ICoachClient, ICoachListing, IMyCoach, LinkStatus } from '../types/Platform';

// The database constrains coach_client_links.status to exactly LinkStatus (coach_client_links_status_check).
const asLinkStatus = (status: string) => status as LinkStatus;

/* ---- coach side ---- */

export const getClients = async (): Promise<ICoachClient[]> => {
  const { data, error } = await supabase.rpc('my_clients');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    linkId: r.id,
    clientId: r.client_id,
    username: r.username,
    name: r.name ?? '',
    status: asLinkStatus(r.status),
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
  }));
};

export const inviteClient = async (username: string): Promise<void> => {
  const { error } = await supabase.rpc('invite_client', { p_username: normalizeUsername(username) });
  if (error) throw new Error(error.message);
};

/** Coach withdraws a pending invite. */
export const cancelInvite = async (linkId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_invite', { p_link_id: linkId });
  if (error) throw new Error(error.message);
};

/**
 * Either party ends an accepted coaching relationship. The coach immediately loses access to the
 * client's workouts; programs already delivered stay with the client. Ending twice is harmless.
 */
export const endRelationship = async (linkId: string): Promise<void> => {
  const { error } = await supabase.rpc('end_relationship', { p_link_id: linkId });
  if (error) throw new Error(error.message);
};

/* ---- client side ---- */

export const getMyCoaches = async (): Promise<IMyCoach[]> => {
  const { data, error } = await supabase.rpc('my_coaches');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    linkId: r.id,
    coachId: r.coach_id,
    username: r.username,
    name: r.name ?? '',
    bio: r.bio ?? '',
    coachTags: r.coach_tags ?? [],
    avatarUrl: r.avatar_url,
    status: asLinkStatus(r.status),
    acceptedAt: r.accepted_at,
  }));
};

export const respondToInvite = async (linkId: string, accept: boolean): Promise<void> => {
  const { error } = await supabase.rpc('respond_to_invite', { p_link_id: linkId, p_accept: accept });
  if (error) throw new Error(error.message);
};

export const getCoachDirectory = async (): Promise<ICoachListing[]> => {
  const { data, error } = await supabase.rpc('list_coaches');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name ?? '',
    bio: r.bio ?? '',
    coachTags: r.coach_tags ?? [],
    avatarUrl: r.avatar_url,
  }));
};
