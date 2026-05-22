export function parseDuration(raw: string): Date | null {
  const m = raw.trim().match(/^(\d+)\s*(m|min|h|hr|d|day)s?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const ms =
    unit === 'm' || unit === 'min' ? n * 60_000 :
    unit === 'h' || unit === 'hr' ? n * 3_600_000 :
    n * 86_400_000;
  return new Date(Date.now() + ms);
}

export function parseAbsolute(raw: string): Date | null {
  const t = raw.trim();

  const tomorrowMatch = t.match(/^tomorrow(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (tomorrowMatch) {
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + 1);
    if (tomorrowMatch[1] !== undefined) {
      let h = parseInt(tomorrowMatch[1], 10);
      const min = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
      const ampm = tomorrowMatch[3]?.toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      base.setUTCHours(h, min, 0, 0);
    } else {
      base.setUTCHours(9, 0, 0, 0);
    }
    return base;
  }

  const isoMatch = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (isoMatch) {
    const [, year, month, day, h = '00', min = '00'] = isoMatch;
    const d = new Date(`${year}-${month}-${day}T${h.padStart(2, '0')}:${min.padStart(2, '0')}:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

export function parseWhen(raw: string): Date | null {
  return parseDuration(raw) ?? parseAbsolute(raw);
}
