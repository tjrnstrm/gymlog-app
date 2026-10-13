import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditProfile from '../components/EditProfile';
import { respondToAdminInvite } from '../api/access';
import { useAuth } from '../hooks/useAuth';
import { useWorkouts } from '../hooks/useWorkouts';
import { enablePushNotifications } from '../lib/push';

function describeLastWorkout(workouts: { name: string; date: string }[]): string {
  if (workouts.length === 0) return 'No workouts yet';
  const latest = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const days = Math.max(
    0,
    Math.round(
      (new Date().setHours(0, 0, 0, 0) - new Date(latest.date).setHours(0, 0, 0, 0)) / 86_400_000,
    ),
  );
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `Last workout: ${latest.name}, ${when}`;
}

/** Identity and a short list. Statistics live on the Volume tab, history on the Workout tab. */
export default function Profile() {
  const { profile, access, logout, refresh } = useAuth();
  const { workouts } = useWorkouts();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'enabled' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const displayName = profile?.name || profile?.username || '';
  const initials = displayName.trim().slice(0, 2).toUpperCase();

  async function handleEnablePush() {
    setPushStatus('enabling');
    setError(null);
    try {
      await enablePushNotifications();
      setPushStatus('enabled');
    } catch (err) {
      setPushStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function handleAdminInvite(accept: boolean) {
    setError(null);
    try {
      await respondToAdminInvite(accept);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const pushValue =
    pushStatus === 'enabled' ? 'On' : pushStatus === 'enabling' ? 'Enabling...' : pushStatus === 'error' ? 'Try again' : 'Off';

  return (
    <div className="profile">
      <div className="profile__identity">
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="profile__avatar" />
        ) : (
          <div className="profile__avatar" aria-hidden="true">
            {initials}
          </div>
        )}
        <h1 className="profile__name">{displayName}</h1>
        {/* Without a display name the username is already the heading, so it is not repeated. */}
        {profile?.name && profile.username && <span className="profile__handle">@{profile.username}</span>}
        {(access.coach || profile?.isAdmin) && (
          <span className="chip">{profile?.isAdmin ? 'Admin' : 'Coach plan active'}</span>
        )}
      </div>

      <p className="profile__last">{describeLastWorkout(workouts)}</p>

      {access.adminInvite && (
        <div className="card stack stack--tight">
          <strong>You&apos;ve been invited to be an admin.</strong>
          <div className="btn-group">
            <button type="button" className="btn-success" onClick={() => void handleAdminInvite(true)}>
              Accept
            </button>
            <button type="button" onClick={() => void handleAdminInvite(false)}>
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="profile__rows">
        <button type="button" className="profile-row" onClick={() => setEditing(true)}>
          <span>Edit profile</span>
          <span className="profile-row__go">›</span>
        </button>
        <button
          type="button"
          className="profile-row"
          onClick={() => void handleEnablePush()}
          disabled={pushStatus === 'enabling' || pushStatus === 'enabled'}
        >
          <span>Notifications</span>
          <span className="profile-row__go">{pushValue} ›</span>
        </button>
        {/* The coach and admin dashboards have no mobile view yet, so they only show on wide screens. */}
        <button type="button" className="profile-row profile-row--desktop" onClick={() => navigate('/coach/clients')}>
          <span>Coach dashboard</span>
          <span className="profile-row__go">›</span>
        </button>
        {profile?.isAdmin && (
          <button type="button" className="profile-row profile-row--desktop" onClick={() => navigate('/admin')}>
            <span>Admin dashboard</span>
            <span className="profile-row__go">›</span>
          </button>
        )}
        <button type="button" className="profile-row profile-row--quiet" onClick={() => void logout()}>
          <span>Log out</span>
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {editing && (
        <div className="modal-overlay modal-overlay--sheet" onClick={() => setEditing(false)}>
          <div className="modal modal--sheet" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h5>Edit profile</h5>
              <button type="button" className="modal__close" onClick={() => setEditing(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <EditProfile onSaved={() => setEditing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
