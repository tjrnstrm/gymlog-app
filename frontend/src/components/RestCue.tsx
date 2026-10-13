import type { Cue } from "../hooks/useRestCue";

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

interface Props {
  cue: Cue;
  onStop: () => void;
  onExtend: (seconds: number) => void;
}

/** Shown under the sets after one is ticked: a rest countdown, or an instruction with no timer. */
export function RestCue({ cue, onStop, onExtend }: Props) {
  const timed = cue.total > 0;
  return (
    <div className="rest-cue" role="status">
      <div className="rest-cue__row">
        <span className="rest-cue__text">{cue.text}</span>
        {timed ? <span className="rest-cue__time">{mmss(cue.remaining)}</span> : null}
        <span className="rest-cue__actions">
          {timed && (
            <button type="button" onClick={() => onExtend(30)}>
              +30 s
            </button>
          )}
          <button type="button" onClick={onStop}>
            {timed ? "Skip" : "OK"}
          </button>
        </span>
      </div>
      {timed && (
        <div className="rest-cue__bar">
          <i style={{ width: `${(100 * cue.remaining) / cue.total}%` }} />
        </div>
      )}
    </div>
  );
}
