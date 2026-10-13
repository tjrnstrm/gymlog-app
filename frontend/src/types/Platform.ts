/**
 * pending -> accepted | declined | cancelled (by the coach); accepted -> ended (by either party).
 * declined, cancelled and ended links can be re-opened by a new invite, which needs fresh consent.
 */
export type LinkStatus = 'pending' | 'accepted' | 'declined' | 'ended' | 'cancelled';

/** One of a coach's clients (or pending invites), as the coach sees it. */
export interface ICoachClient {
  linkId: string;
  clientId: string;
  username: string;
  name: string;
  status: LinkStatus;
  createdAt: string;
  acceptedAt: string | null;
}

/** A coach linked to (or inviting) the signed-in user, as the client sees it. */
export interface IMyCoach {
  linkId: string;
  coachId: string;
  username: string;
  name: string;
  bio: string;
  coachTags: string[];
  avatarUrl: string | null;
  status: LinkStatus;
  /** When the client accepted; null while the invite is pending. */
  acceptedAt: string | null;
}

export interface ICoachListing {
  id: string;
  username: string;
  name: string;
  bio: string;
  coachTags: string[];
  avatarUrl: string | null;
}

export interface IProgramExercise {
  id: string;
  name: string;
  sets: number | null;
  reps: string;
  rest: string;
  feeder: string;
  comment: string;
  link: string;
}

export interface IProgramDay {
  id: string;
  name: string;
  exercises: IProgramExercise[];
}

export interface IProgram {
  id: string;
  coachId: string;
  name: string;
  status: 'draft' | 'sent';
  clientId: string | null;
  message: string;
  sentAt: string | null;
  updatedAt: string;
  days: IProgramDay[];
}

export interface IAdminOverview {
  total: number;
  coaches: number;
  granted: number;
  paid: number;
  clients: number;
}

export interface IAdminUser {
  id: string;
  username: string;
  name: string;
  isAdmin: boolean;
  coachActive: boolean;
  coachSource: 'granted' | 'paid' | null;
  requested: boolean;
  isClient: boolean;
}

export interface IAdminMember {
  id: string;
  username: string;
  name: string;
  status: 'admin' | 'pending';
}
