import { describe, expect, it } from 'vitest'
import { monthWindow, shiftMonth, weekRows } from '../features/editorial/model/dates'

describe('editorial date-only planning', () => {
  it('keeps month and year boundaries as date strings', () => {
    expect(monthWindow('2030-12')).toEqual({ from: '2030-12-01', to: '2030-12-31' })
    expect(shiftMonth('2030-12', 1)).toBe('2031-01')
    expect(shiftMonth('2031-01', -1)).toBe('2030-12')
    expect(monthWindow('2028-02').to).toBe('2028-02-29')
  })

  it('derives four or five visual weeks from the dates', () => {
    expect(weekRows('2027-02')).toHaveLength(4)
    expect(weekRows('2030-10')).toHaveLength(5)
    expect(weekRows('2027-02')[0][0]).toBe('2027-02-01')
  })

  it('does not shift date-only values to the browser timezone', () => {
    const dates = weekRows('2030-10').flat()
    expect(dates).toContain('2030-10-31')
    expect(monthWindow('2030-10').to).toBe('2030-10-31')
  })
})
