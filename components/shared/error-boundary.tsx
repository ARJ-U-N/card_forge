'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Catches render errors in child components and shows a recoverable error UI.
 * Prevents the entire app from crashing due to a single component failure.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8">
          <AlertTriangleIcon className="size-8 text-destructive" />
          <div className="text-center">
            <h3 className="font-semibold text-sm">
              {this.props.fallbackTitle ?? 'Something went wrong'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCwIcon data-icon="inline-start" />
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
