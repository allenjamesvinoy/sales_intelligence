/** Today as yyyy-mm-dd in the rep's local time zone. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Oct 20, 2026" from a yyyy-mm-dd date, read as a local date. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Oct 12, 9:40 AM" from a full timestamp. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export function formatDistance(mi: number): string {
  return `${mi.toFixed(1)} mi`;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isStale(iso: string, now = Date.now()): boolean {
  return now - new Date(iso).getTime() > STALE_AFTER_MS;
}
