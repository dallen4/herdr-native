import type { ClaudeUsage } from '@devhub/shared/hub';
import { useEffect, useState } from 'react';
import { useHub } from '../contexts/HubContext.tsx';

const POLL_MS = 5 * 60_000;

/** Claude plan usage on the connected machine's account. The bridge
 * caches and rate-limits; this just asks periodically and on focus. */
export function useClaudeUsage(): ClaudeUsage | null {
  const { connection, status } = useHub();
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);

  useEffect(() => {
    setUsage(null);
    if (!connection || status !== 'online') return;
    let live = true;
    const load = (force = false) =>
      connection
        .request('usage.get', { force })
        .then((u) => live && setUsage(u))
        .catch(() => {});
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [connection, status]);

  return usage;
}

/** "2h 14m", "38m", "3d 4h" until an ISO time. */
export function untilReset(
  iso: string | null,
  now = Date.now(),
): string {
  if (!iso) return '';
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return 'now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
