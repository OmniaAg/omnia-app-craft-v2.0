export function monthWindow(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes editorial inválido')
  const [year, number] = month.split('-').map(Number)
  const from = `${month}-01`
  const to = `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, '0')}`
  return { from, to }
}

export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
}

export function weekRows(month: string) {
  const { from, to } = monthWindow(month)
  const first = new Date(`${from}T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(first.getUTCDate() - offset)
  const last = new Date(`${to}T00:00:00Z`)
  const days = Math.ceil((offset + last.getUTCDate()) / 7) * 7
  return Array.from({ length: days / 7 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(gridStart)
      date.setUTCDate(gridStart.getUTCDate() + week * 7 + day)
      return date.toISOString().slice(0, 10)
    }),
  )
}
