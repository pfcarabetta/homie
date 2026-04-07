import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#F9F5F2',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '2rem',
              color: '#2D2926',
              marginBottom: '0.75rem',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1.125rem',
              color: '#2D2926',
              opacity: 0.7,
              marginBottom: '1.5rem',
              maxWidth: '28rem',
            }}
          >
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1rem',
              fontWeight: 600,
              color: '#F9F5F2',
              backgroundColor: '#E8632B',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
