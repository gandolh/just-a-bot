export const ALL_TIMEZONES: string[] = Intl.supportedValuesOf('timeZone');
const TZ_SET = new Set(ALL_TIMEZONES);

export function isValidTimezone(tz: string): boolean {
  return TZ_SET.has(tz);
}

export function getUtcOffsetMinutes(tz: string): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(now);
  const localMs = new Date(
    localStr.replace(/(\d+)-(\d+)-(\d+),? (\d+):(\d+):(\d+)/, '$1-$2-$3T$4:$5:$6'),
  ).getTime();
  return Math.round((localMs - utcMs) / 60_000);
}

export function formatLocalTime(tz: string): string {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeStyle: 'short',
    timeZone: tz,
  }).format(now);
  const offsetMin = getUtcOffsetMinutes(tz);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  return `${timeStr} — UTC${sign}${hh}:${mm}`;
}
