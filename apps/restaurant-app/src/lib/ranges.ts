export type RangeKey = 'today' | '7d' | '30d';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

/** Device-local day boundaries; the API stores and aggregates UTC timestamps. */
export function rangeQuery(key: RangeKey) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = key === 'today' ? 0 : key === '7d' ? 6 : 29;
  const from = new Date(start.getTime() - days * 86_400_000);
  const to = new Date(start.getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
