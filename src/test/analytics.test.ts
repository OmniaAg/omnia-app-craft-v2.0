import { describe, expect, it } from 'vitest'
import { analyticsCsv, csvCell, filterSchema, mexicoToday, period, readFilters } from '../features/analytics/model'
import { analyticsQueries } from '../features/analytics/api'

describe('analytics filters and export boundary', () => {
  it('uses Mexico calendar days across UTC midnight and leap years', () => {
    expect(mexicoToday(new Date('2026-10-07T01:00:00Z'))).toBe('2026-10-06')
    expect(period(7, '2024-03-02')).toEqual({ from: '2024-02-25', to: '2024-03-02' })
  })
  it('rejects invalid calendar dates, UUIDs, reversed and expensive ranges', () => {
    for (const f of [ { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-10-07', to: '2026-10-06' },
      { from: '2020-01-01', to: '2026-10-06' }, { from: '2026-10-01', to: '2026-10-06', project: 'bad' } ]) expect(filterSchema.safeParse(f).success).toBe(false)
    expect(readFilters(new URLSearchParams('project=bad')).success).toBe(false)
  })
  it('query keys separate actors, periods, scope, currency and pages', () => {
    const f = { from: '2026-09-01', to: '2026-09-30' }
    const key = analyticsQueries.billing('a', f).queryKey
    expect(key).not.toEqual(analyticsQueries.billing('b', f).queryKey)
    expect(key).not.toEqual(analyticsQueries.billing('a', { ...f, currency: 'USD' }).queryKey)
    expect(key).not.toEqual(analyticsQueries.billing('a', { ...f, organization: '30000000-0000-0000-0000-00000000000a' }).queryKey)
    expect(analyticsQueries.workDetails('a', f, 'overdue', 0).queryKey).not.toEqual(analyticsQueries.workDetails('a', f, 'overdue', 1).queryKey)
  })
  it('neutralizes CSV formulas including whitespace prefixes and embedded delimiters', () => {
    for (const value of ['=cmd()', '+SUM(1)', '-1+1', '@SUM(1)', ' \t=cmd()', '\n=cmd()']) expect(csvCell(value)).toMatch(/^"'/)
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
    expect(analyticsCsv({ states: { '=formula': 2 } }, { from: '2026-09-01', to: '2026-09-30' }, 'work')).toContain('states.=formula')
    expect(csvCell(0)).toBe('"0"')
  })
})
