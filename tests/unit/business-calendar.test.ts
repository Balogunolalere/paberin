/**
 * Business calendar (mirrors the admin backend `src/lib/business-calendar.ts`).
 *
 * Run: npx vitest run tests/unit/business-calendar.test.ts
 */
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_BUSINESS_CALENDAR,
  parseBusinessCalendar,
  parseHolidays,
  fmtClock,
  parseClockTime,
  isWorkingDayCal,
  snapToBusinessOpening,
  lagosWallTime,
} from '@/lib/business-calendar'

// Lagos = UTC+1. Wed 5 Aug 2026 11:00 Lagos = 10:00 UTC.
const WED_NOON = Date.parse('2026-08-05T10:00:00Z')
// Mon 10 Aug 08:00 Lagos = 07:00 UTC.
const MON_0800 = Date.UTC(2026, 7, 10, 7, 0)
// Fri 14 Aug 18:30 Lagos = 17:30 UTC (after the 17:00 close).
const FRI_1830 = Date.UTC(2026, 7, 14, 17, 30)
// Sat 15 Aug 12:00 Lagos = 11:00 UTC.
const SAT_NOON = Date.UTC(2026, 7, 15, 11, 0)

describe('calendar config parsing', () => {
  test('defaults to 08:00–17:00 Mon–Fri with no holidays', () => {
    expect(DEFAULT_BUSINESS_CALENDAR.openMinute).toBe(480)
    expect(DEFAULT_BUSINESS_CALENDAR.closeMinute).toBe(1020)
    expect(DEFAULT_BUSINESS_CALENDAR.workingDays).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_BUSINESS_CALENDAR.holidays.size).toBe(0)
  })

  test('parseBusinessCalendar reads the public settings keys', () => {
    const cal = parseBusinessCalendar({
      working_day_open: '10:00',
      working_day_close: '16:00',
      observed_holidays: JSON.stringify(['2026-08-06', { date: '2026-08-07', name: 'Demo' }]),
    })
    expect(cal.openMinute).toBe(600)
    expect(cal.closeMinute).toBe(960)
    expect(cal.holidays.has('2026-08-06')).toBe(true)
    expect(cal.holidays.has('2026-08-07')).toBe(true)
  })

  test('never throws — garbage falls back to defaults (open >= close too)', () => {
    const bad = parseBusinessCalendar({
      working_day_open: '25:00',
      working_day_close: '17:00',
      observed_holidays: 'nope',
    } as Record<string, string>)
    expect(bad.openMinute).toBe(480)
    expect(bad.closeMinute).toBe(1020)
    expect(bad.holidays.size).toBe(0)
    expect(parseBusinessCalendar(null).openMinute).toBe(480)
    const reversed = parseBusinessCalendar({ working_day_open: '17:00', working_day_close: '08:00' })
    expect(reversed.openMinute).toBe(480)
  })

  test('parseHolidays drops invalid dates and dedupes; fmtClock round-trips', () => {
    expect(parseHolidays('["2026-08-11","2026-02-30","2026-08-11"]')).toEqual(new Set(['2026-08-11']))
    expect(fmtClock(480)).toBe('08:00')
    expect(parseClockTime('8:00', 480)).toBe(480)
  })
})

describe('working-day checks + snap', () => {
  test('weekends are never working days; observed holidays are not either', () => {
    expect(isWorkingDayCal(WED_NOON)).toBe(true)
    expect(isWorkingDayCal(SAT_NOON)).toBe(false)
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-10']) } // Mon holiday
    expect(isWorkingDayCal(MON_0800, cal)).toBe(false)
  })

  test('snap: during hours → now; Friday after close → Monday 08:00', () => {
    expect(snapToBusinessOpening(WED_NOON)).toBe(WED_NOON)
    expect(snapToBusinessOpening(FRI_1830)).toBe(Date.UTC(2026, 7, 17, 7, 0)) // Mon 08:00 Lagos
    expect(snapToBusinessOpening(SAT_NOON)).toBe(Date.UTC(2026, 7, 17, 7, 0))
  })

  test('snap skips a holiday Monday after a weekend', () => {
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-17']) }
    expect(snapToBusinessOpening(SAT_NOON, cal)).toBe(Date.UTC(2026, 7, 18, 7, 0)) // Tue 08:00
  })

  test('snap respects customized hours (closing exclusive)', () => {
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, openMinute: 10 * 60, closeMinute: 16 * 60 }
    // Mon 16:00 Lagos = 15:00 UTC — at close → Tue 10:00 Lagos = 09:00 UTC
    expect(snapToBusinessOpening(Date.UTC(2026, 7, 10, 15, 0), cal)).toBe(Date.UTC(2026, 7, 11, 9, 0))
  })

  test('lagosWallTime reads the wall clock', () => {
    const w = lagosWallTime(WED_NOON)
    expect(w.getUTCHours()).toBe(11)
    expect(w.getUTCDay()).toBe(3) // Wednesday
  })
})
