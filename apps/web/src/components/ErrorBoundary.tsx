import { Component, type ReactNode, type ErrorInfo } from 'react';

/**
 * Catches uncaught render errors in React islands so a single broken
 * component doesn't white-screen the entire page. Shows a small inline
 * error message with a retry button. The original error is logged to the
 * browser console for debugging.
 *
 * Usage in an Astro page:
 *
 *   ---
 *   import ErrorBoundary from '../components/ErrorBoundary';
 *   import DishExplorer from '../components/DishExplorer';
 *   ---
 *   <ErrorBoundary name="dish-explorer">
 *     <DishExplorer client:load initial={...} />
 *   </ErrorBoundary>
 *
 * Note: this only catches errors during *rendering*. Errors in event
 * handlers, async code, or SSR data fetches still need try/catch.
 */

interface Props {
  children: ReactNode;
  /** Short label shown in the fallback (e.g. "Map", "Dish list"). */
  name: string;
  /** Optional fallback UI override. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to the browser console with structured context.
    // Astro pages don't have a server logger, so console is the best we
    // can do without dragging in a client-side error reporter.
    console.error('[ErrorBoundary]', this.props.name, error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        style={{
          padding: '1rem 1.25rem',
          margin: '1rem 0',
          border: '1px solid #fca5a5',
          borderRadius: '0.5rem',
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '0.9rem',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          {this.props.name} failed to load
        </div>
        <div style={{ marginBottom: '0.75rem', color: '#7f1d1d' }}>
          {error.message || 'An unexpected error occurred'}
        </div>
        <button
          type="button"
          onClick={this.reset}
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid #991b1b',
            borderRadius: '0.375rem',
            backgroundColor: 'white',
            color: '#991b1b',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}