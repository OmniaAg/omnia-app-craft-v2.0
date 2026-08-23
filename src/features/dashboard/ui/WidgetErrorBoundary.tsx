import { Component, type ErrorInfo, type ReactNode } from 'react'

export class WidgetErrorBoundary extends Component<{ children: ReactNode; title: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(`Widget ${this.props.title} failed`, error, info.componentStack)
  }
  render() {
    if (this.state.failed) return <p className="dashboard-widget__status dashboard-widget__status--error" role="alert">Este widget no pudo mostrarse. El resto del dashboard sigue disponible.</p>
    return this.props.children
  }
}
