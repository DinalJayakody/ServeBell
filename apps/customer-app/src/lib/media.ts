import { config } from '@servebell/mobile-core';

/** API-relative file paths (dev storage) become absolute; R2 URLs pass through. */
export function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${config.apiUrl}${url}`;
}

export function formatHours(minutes: number) {
  const m = minutes % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${mm} ${suffix}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}
