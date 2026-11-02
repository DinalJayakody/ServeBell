import type { OpeningWindow } from '@servebell/shared';

/** Local weekday (0=Sun) and minute-of-day in the restaurant's timezone. */
export function localClock(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Handles overnight windows (closesMinute > 1440) that spill into the next day. */
export function isOpenNow(hours: OpeningWindow[], timezone: string, now = new Date()) {
  const { day, minute } = localClock(timezone, now);
  const yesterday = (day + 6) % 7;
  return hours.some(
    (h) =>
      (h.dayOfWeek === day && minute >= h.opensMinute && minute < h.closesMinute) ||
      (h.dayOfWeek === yesterday && h.closesMinute > 1440 && minute < h.closesMinute - 1440),
  );
}

/** UTC instant of local midnight today in the given timezone ("today" for staff dashboards). */
export function localDayStart(timezone: string, now = new Date()) {
  const { minute } = localClock(timezone, now);
  const start = new Date(now.getTime() - minute * 60_000);
  start.setUTCSeconds(0, 0);
  return start;
}
