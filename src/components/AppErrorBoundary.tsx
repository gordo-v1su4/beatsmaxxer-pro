import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Beat Surfer Pro crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b0c",
          color: "#c8cdd4",
          fontFamily: "Rajdhani, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, letterSpacing: "0.08em" }}>
            UI CRASHED
          </h1>
          <p style={{ margin: "0 0 16px", color: "#8a9098", lineHeight: 1.5 }}>
            The interface hit a runtime error and stopped responding. Reload the page
            after updating to the latest build.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: "#111214",
              border: "1px solid #1e2226",
              borderRadius: 4,
              overflow: "auto",
              fontSize: 12,
              color: "#ef4444",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
