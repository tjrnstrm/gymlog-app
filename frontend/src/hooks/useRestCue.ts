import { useCallback, useEffect, useState } from 'react';

/**
 * The bar shown after a set is ticked: either a rest countdown (seconds > 0) or a plain instruction
 * with no timer ("Drop to 40 kg now", "Now: the second exercise of the superset").
 */
interface RawCue {
  text: string;
  total: number;
  endsAt: number;
}

export interface Cue {
  text: string;
  total: number;
  remaining: number;
}

export function useRestCue() {
  const [raw, setRaw] = useState<RawCue | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const running = raw !== null && raw.total > 0;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  const start = useCallback((text: string, seconds: number) => {
    const t = Date.now();
    setNow(t);
    setRaw({ text, total: seconds, endsAt: t + seconds * 1000 });
  }, []);
  const stop = useCallback(() => setRaw(null), []);
  const extend = useCallback((seconds: number) => setRaw((c) => (c && c.total > 0 ? { ...c, total: c.total + seconds, endsAt: c.endsAt + seconds * 1000 } : c)), []);

  let cue: Cue | null = null;
  if (raw) {
    const remaining = raw.total > 0 ? Math.max(0, Math.ceil((raw.endsAt - now) / 1000)) : 0;
    if (raw.total === 0 || remaining > 0) cue = { text: raw.text, total: raw.total, remaining };
  }
  return { cue, start, stop, extend };
}
