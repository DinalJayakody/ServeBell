import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';

/** Re-renders every `ms` so elapsed timers tick locally — no polling the API. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

/** Idempotency keys / client message ids. */
export const newId = () => Crypto.randomUUID();
