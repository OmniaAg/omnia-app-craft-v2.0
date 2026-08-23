import type { ReactNode } from 'react'

export function WidgetStatus({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return <p className={`dashboard-widget__status dashboard-widget__status--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}

export function WidgetList({ children }: { children: ReactNode }) {
  return <ul className="dashboard-widget__list">{children}</ul>
}
