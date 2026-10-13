import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { endRelationship, getCoachDirectory, getMyCoaches, respondToInvite } from "../../api/coachClients";
import { getPrograms } from "../../api/programs";
import { useAuth } from "../../hooks/useAuth";
import { useWorkouts } from "../../hooks/useWorkouts";
import type { ICoachListing, IMyCoach, IProgram } from "../../types/Platform";

const initialsOf = (text: string) => text.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function daysAgo(iso: string): string {
  const days = Math.max(
    0,
    Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000),
  );
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt="" className="coach-tab__avatar" />
  ) : (
    <div className="coach-tab__avatar" aria-hidden="true">
      {initialsOf(name)}
    </div>
  );
}

/** From your coach: your coach and what they can see, the programmes you received, or a way to find one. */
export default function ClientDashboard() {
  const { user, profile } = useAuth();
  const { workouts } = useWorkouts();
  const [coaches, setCoaches] = useState<IMyCoach[]>([]);
  const [programs, setPrograms] = useState<IProgram[]>([]);
  const [directory, setDirectory] = useState<ICoachListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tag, setTag] = useState<string>("All");
  const [openCoach, setOpenCoach] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<IMyCoach | null>(null);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([getMyCoaches(), getPrograms(), getCoachDirectory()])
      .then(([mine, progs, dir]) => {
        setCoaches(mine);
        setPrograms(progs.filter((p) => p.clientId === user?.id && p.status === "sent"));
        setDirectory(dir);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [reload, user?.id]);

  async function respond(linkId: string, accept: boolean) {
    setError(null);
    try {
      await respondToInvite(linkId, accept);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function confirmEnd() {
    if (!endTarget) return;
    setEnding(true);
    setError(null);
    try {
      await endRelationship(endTarget.linkId);
      setNotice(`Coaching with @${endTarget.username} ended. The programmes they sent stay with you.`);
      setEndTarget(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEnding(false);
    }
  }

  async function copyUsername() {
    if (!profile?.username) return;
    try {
      await navigator.clipboard.writeText(`@${profile.username}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the username is on screen to select */
    }
  }

  const invites = coaches.filter((c) => c.status === "pending");
  const connected = coaches.filter((c) => c.status === "accepted");
  const connectedIds = new Set(connected.map((c) => c.coachId));
  const otherPrograms = programs.filter((p) => !connectedIds.has(p.coachId));
  const tags = useMemo(() => ["All", ...new Set(directory.flatMap((c) => c.coachTags))], [directory]);
  const listed = directory.filter((c) => tag === "All" || c.coachTags.includes(tag));

  const programRows = (list: IProgram[]) =>
    list.map((p) => {
      const from = coaches.find((c) => c.coachId === p.coachId);
      return (
        <Link key={p.id} to={`/client/programs/${p.id}`} className="profile-row">
          <span>
            {p.name}
            <small>
              {p.days.length} {p.days.length === 1 ? "day" : "days"}
              {from ? ` · from @${from.username}` : ""}
              {p.sentAt ? ` · sent ${daysAgo(p.sentAt)}` : ""}
            </small>
          </span>
          <span className="profile-row__go">›</span>
        </Link>
      );
    });

  return (
    <div className="coach-tab">
      {error && <p className="form-error">{error}</p>}
      {notice && (
        <div className="card coach-tab__notice">
          <span>{notice}</span>
          <button type="button" className="btn-small" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {invites.map((c) => (
            <section key={c.linkId} className="card stack">
              <div className="row">
                <Avatar name={c.name || c.username} url={c.avatarUrl} />
                <div className="stack stack--tight">
                  <strong>@{c.username} wants to coach you</strong>
                  <span className="muted small">{c.name || "Coach"}</span>
                </div>
              </div>
              <p className="coach-tab__consent">
                If you accept, {c.name || `@${c.username}`} can see <strong>all your workouts, past and future</strong>,
                and send you programmes. They cannot change anything. You can end it whenever you like and they lose
                access straight away. Programmes they sent stay with you.
              </p>
              <div className="btn-group">
                <button type="button" onClick={() => void respond(c.linkId, false)}>
                  Decline
                </button>
                <button type="button" className="btn-success" onClick={() => void respond(c.linkId, true)}>
                  Accept
                </button>
              </div>
            </section>
          ))}

          {connected.map((c) => {
            const shared = c.acceptedAt ? workouts.filter((w) => w.date >= c.acceptedAt!).length : 0;
            const theirPrograms = programs.filter((p) => p.coachId === c.coachId);
            return (
              <div key={c.linkId} className="coach-tab__coach">
                <div className="coach-tab__identity">
                  <Avatar name={c.name || c.username} url={c.avatarUrl} />
                  <h1 className="coach-tab__name">{c.name || c.username}</h1>
                  {c.name && <span className="coach-tab__handle">@{c.username}</span>}
                  {c.coachTags.length > 0 && (
                    <div className="row row--wrap" style={{ justifyContent: "center" }}>
                      {c.coachTags.map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.acceptedAt && (
                    <span className="coach-tab__last">
                      Coaching you since {formatDate(c.acceptedAt)} · {shared} {shared === 1 ? "workout" : "workouts"} shared
                    </span>
                  )}
                </div>

                <section className="card stack stack--tight">
                  <h2 className="eyebrow">Programmes</h2>
                  {theirPrograms.length === 0 ? (
                    <p className="muted">No programme yet. When {c.name || `@${c.username}`} sends one it appears here.</p>
                  ) : (
                    <div className="coach-tab__rows">{programRows(theirPrograms)}</div>
                  )}
                </section>

                <section className="card stack stack--tight">
                  <h2 className="eyebrow">What your coach can see</h2>
                  <p className="coach-tab__consent">
                    All your workouts, past and future, so they can see how training is going. Nothing else from your
                    account, and they cannot change your workouts.
                  </p>
                </section>

                <button type="button" className="coach-tab__end" onClick={() => setEndTarget(c)}>
                  End coaching
                </button>
              </div>
            );
          })}

          {otherPrograms.length > 0 && (
            <section className="card stack stack--tight">
              <h2 className="eyebrow">Programmes you received</h2>
              <div className="coach-tab__rows">{programRows(otherPrograms)}</div>
            </section>
          )}

          {connected.length === 0 && invites.length === 0 && (
            <>
              <div className="stack stack--tight">
                <h1 className="coach-tab__empty-title">No coach yet</h1>
                <p className="muted">
                  Coaches invite you by username. Share yours and they can send an invite, or look through the coaches
                  on Bro Split below.
                </p>
              </div>

              {profile?.username && (
                <section className="card stack stack--tight">
                  <h2 className="eyebrow">Your username</h2>
                  <div className="row row--between">
                    <span className="username-big">@{profile.username}</span>
                    <button type="button" className="btn-small" onClick={() => void copyUsername()}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </section>
              )}

              <section className="stack stack--tight">
                <h2 className="eyebrow">Coaches on Bro Split</h2>
                {directory.length === 0 ? (
                  <div className="card">
                    <p className="muted">No coaches are listed yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="row row--wrap">
                      {tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`pill${t === tag ? " pill--active" : ""}`}
                          onClick={() => setTag(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {listed.map((c) => (
                      <div key={c.id} className="card stack stack--tight">
                        <div className="row">
                          <Avatar name={c.name || c.username} url={c.avatarUrl} />
                          <div className="stack stack--tight">
                            <strong>@{c.username}</strong>
                            {c.name && <span className="muted small">{c.name}</span>}
                          </div>
                        </div>
                        {c.coachTags.length > 0 && (
                          <div className="row row--wrap">
                            {c.coachTags.map((t) => (
                              <span key={t} className="chip">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {openCoach === c.id && <p>{c.bio || "This coach hasn't written a bio yet."}</p>}
                        <button type="button" onClick={() => setOpenCoach(openCoach === c.id ? null : c.id)}>
                          {openCoach === c.id ? "Hide profile" : "View profile"}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}

      {endTarget && (
        <div className="modal-overlay modal-overlay--sheet" onClick={() => !ending && setEndTarget(null)}>
          <div className="modal modal--sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="End coaching">
            <h5>End coaching with @{endTarget.username}?</h5>
            <p className="coach-tab__consent">
              They stop seeing your workouts <strong>straight away</strong>. Programmes they already sent stay with you,
              and you can be invited again later.
            </p>
            <div className="btn-group">
              <button type="button" onClick={() => setEndTarget(null)} disabled={ending}>
                Keep coaching
              </button>
              <button type="button" className="btn-success" onClick={() => void confirmEnd()} disabled={ending}>
                {ending ? "Ending..." : "End coaching"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
