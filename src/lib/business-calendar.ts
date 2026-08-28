/**
 * Business calendar — mirrors the admin backend's `src/lib/business-calendar.ts`.
 *
 * The shop's working schedule is CONFIGURABLE on the admin Settings page:
 *  - `working_day_open` / `working_day_close` (Lagos time, e.g. 08:00 / 17:00)
 *  - `observed_holidays` — the public holidays this business actually observes
 *    (JSON array of "YYYY-MM-DD" dates or { date, name } entries)
 *
 * Exposed publicly by GET /api/settings?brand=SKYAL (the calendar is
 * business-wide, stored under the SKYAL brand row). Rules mirrored from the
 * backend:
 *  - a pickup must be a working day (Mon–Fri minus holidays) within
 *    [open, close) Lagos time — closing is EXCLUSIVE (17:00 is rejected)
 *  - an order placed after closing, on a weekend or on a holiday starts work
 *    at the NEXT opening (snapToBusinessOpening) — the express tier is
 *    computed from that instant
 *  - day counts skip weekends + holidays
 *
 * The fetch is best-effort: on any failure the DEFAULT_BUSINESS_CALENDAR is
 * used so checkout never breaks.
 */

export interface BusinessCalendar {
  openMinute: number;
  closeMinute: number;
  workingDays: readonly number[];
  holidays: ReadonlySet<string>;
}

/** Shop's real default schedule: 08:00–17:00 Mon–Fri, no holidays. */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  openMinute: 8 * 60,
  closeMinute: 17 * 60,
  workingDays: [1, 2, 3, 4, 5],
  holidays: new Set<string>(),
};

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

/** 480 → '08:00' */
export function fmtClock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = Math.round(minuteOfDay % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HH:MM' → minute-of-day; garbage → fallback. */
export function parseClockTime(raw: string | null | undefined, fallback: number): number {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return fallback;
  return h * 60 + mi;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(key: string): boolean {
  const m = DATE_RE.exec(key);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parse the stored observed_holidays JSON into a Set (defensive). */
export function parseHolidays(raw: string | null | undefined): Set<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' && raw.trim() ? raw : '[]');
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const out = new Set<string>();
  for (const item of parsed) {
    const date = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).date : null;
    if (typeof date === 'string' && isValidCalendarDate(date)) out.add(date);
  }
  return out;
}

/** Build a BusinessCalendar from the public settings payload (defensive). */
export function parseBusinessCalendar(raw: Record<string, string> | null | undefined): BusinessCalendar {
  const open = parseClockTime(raw?.working_day_open, DEFAULT_BUSINESS_CALENDAR.openMinute);
  const close = parseClockTime(raw?.working_day_close, DEFAULT_BUSINESS_CALENDAR.closeMinute);
  const valid = open < close;
  return {
    openMinute: valid ? open : DEFAULT_BUSINESS_CALENDAR.openMinute,
    closeMinute: valid ? close : DEFAULT_BUSINESS_CALENDAR.closeMinute,
    workingDays: DEFAULT_BUSINESS_CALENDAR.workingDays,
    holidays: parseHolidays(raw?.observed_holidays),
  };
}

let cached: BusinessCalendar | null = null;
let inflight: Promise<BusinessCalendar> | null = null;

/** Best-effort fetch of the configured business calendar (module-cached). */
export function getBusinessCalendar(): Promise<BusinessCalendar> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings?brand=SKYAL`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`settings ${res.status}`);
      const json = (await res.json()) as { data?: Record<string, string> };
      cached = parseBusinessCalendar(json.data ?? undefined);
    } catch {
      cached = DEFAULT_BUSINESS_CALENDAR;
    } finally {
      inflight = null;
    }
    return cached;
  })();
  return inflight;
}

/* ─────────────────── Pure calendar helpers (mirror backend) ─────────────────── */

export const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Lagos = UTC+1, no DST

/** Lagos wall-clock parts of an instant, exposed through the UTC getters. */
export function lagosWallTime(ms: number): Date {
  return new Date(ms + LAGOS_OFFSET_MS);
}

/** 'YYYY-MM-DD' Lagos calendar date of an instant. */
export function lagosDateKey(ms: number): string {
  const w = lagosWallTime(ms);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}`;
}

export function isWorkingDayCal(ms: number, cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR): boolean {
  const w = lagosWallTime(ms);
  return cal.workingDays.includes(w.getUTCDay()) && !cal.holidays.has(lagosDateKey(ms));
}

/** Real instant for a Lagos wall-clock date + minute-of-day (Lagos = UTC+1). */
export function lagosWallToMs(y: number, mo: number, d: number, minuteOfDay: number): number {
  return Date.UTC(y, mo - 1, d, Math.floor(minuteOfDay / 60) - 1, minuteOfDay % 60);
}

/**
 * Mirror of the backend `snapToBusinessOpening` — the moment work can
 * actually start (before opening → today's opening; during hours → now;
 * after closing / weekend / holiday → next working day at opening).
 */
export function snapToBusinessOpening(nowMs: number, cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR): number {
  const w = lagosWallTime(nowMs);
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  const open = cal.openMinute;
  const close = cal.closeMinute;
  const onWorkingDay = cal.workingDays.includes(w.getUTCDay()) && !cal.holidays.has(lagosDateKey(nowMs));
  if (onWorkingDay && minutes < open) {
    return lagosWallToMs(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), open);
  }
  if (onWorkingDay && minutes >= open && minutes < close) return nowMs;
  let day = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
  for (let guard = 0; guard < 800; guard++) {
    day += 86_400_000;
    const dw = new Date(day);
    const key = `${dw.getUTCFullYear()}-${String(dw.getUTCMonth() + 1).padStart(2, '0')}-${String(dw.getUTCDate()).padStart(2, '0')}`;
    if (cal.workingDays.includes(dw.getUTCDay()) && !cal.holidays.has(key)) {
      return lagosWallToMs(dw.getUTCFullYear(), dw.getUTCMonth() + 1, dw.getUTCDate(), open);
    }
  }
  return nowMs + 800 * 86_400_000;
}
