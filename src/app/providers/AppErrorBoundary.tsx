import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from '../../shared/ui/ErrorFallback'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('OMNIA Craft render error', error, errorInfo)
    }
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback />
    }

    return this.props.children
  }
}
