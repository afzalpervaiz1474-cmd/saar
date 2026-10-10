import { useEffect, useState } from 'react';

/**
 * Ticking clock used by elapsed-time displays.
 *
 * `active` should be false when nothing is running so the app does not wake up
 * needlessly (relevant for a backgrounded desktop window).
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
