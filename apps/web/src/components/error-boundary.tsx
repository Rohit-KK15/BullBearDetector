'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center bg-surface-0">
          <div className="text-center">
            <div className="text-3xl mb-4 opacity-30 font-mono">!</div>
            <h2 className="text-lg font-display font-semibold text-white/80 mb-2">Something went wrong</h2>
            <p className="text-sm text-muted font-body mb-4">An unexpected error occurred.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 rounded-lg bg-surface-2 border border-subtle/30 text-sm font-mono text-white/70 hover:text-white hover:bg-surface-3 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
