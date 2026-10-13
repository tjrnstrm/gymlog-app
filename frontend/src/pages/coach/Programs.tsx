import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteProgram, duplicateProgram, getPrograms } from "../../api/programs";
import { getClients } from "../../api/coachClients";
import type { IProgram } from "../../types/Platform";

export default function Programs() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<IProgram[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([getPrograms(), getClients()])
      .then(([list, clients]) => {
        setPrograms(list);
        setClientNames(Object.fromEntries(clients.map((c) => [c.clientId, c.username])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load programs"))
      .finally(() => setLoading(false));
  }, [reload]);

  async function handleDuplicate(id: string) {
    try {
      const newId = await duplicateProgram(id);
      navigate(`/coach/programs/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate");
    }
  }

  async function handleDelete(program: IProgram) {
    if (!window.confirm(`Delete the draft "${program.name}"?`)) return;
    try {
      await deleteProgram(program.id);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="stack">
      <div className="row row--between">
        <h1 className="display page-title">Programs</h1>
        <Link to="/coach/programs/new" className="btn-primary btn-link">New program</Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p>Loading programs...</p>
      ) : programs.length === 0 ? (
        <div className="card">
          <p className="muted">No programs yet. Build one and send it to a client.</p>
        </div>
      ) : (
        <div className="stack stack--tight">
          {programs.map((p) => {
            const exerciseCount = p.days.reduce((n, d) => n + d.exercises.length, 0);
            return (
              <div key={p.id} className="card row row--between program-row">
                <div className="stack stack--tight">
                  <Link to={`/coach/programs/${p.id}`} className="program-row__name">{p.name}</Link>
                  <span className="muted">
                    {p.days.length} {p.days.length === 1 ? "day" : "days"} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
                  </span>
                  <span className={`status status--${p.status === "sent" ? "accepted" : "pending"}`}>
                    {p.status === "sent" ? `Sent to @${clientNames[p.clientId ?? ""] ?? "client"}` : "Draft"}
                  </span>
                </div>
                <div className="row">
                  <Link to={`/coach/programs/${p.id}`} className="btn-small btn-link">Edit</Link>
                  <button type="button" className="btn-small" onClick={() => void handleDuplicate(p.id)}>Duplicate</button>
                  {p.status === "draft" && (
                    <button type="button" className="btn-small btn-small--danger" onClick={() => void handleDelete(p)}>Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
