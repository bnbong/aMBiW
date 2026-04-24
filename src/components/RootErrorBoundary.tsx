import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Top-level boundary. Without this, any unhandled render error blanks the
// entire page (React 18 unmounts the root) — exactly matching the "buttons
// flash for ~0.1s then the screen goes black" symptom we saw on mobile. Here
// we catch the error and render it visibly so whatever failed (HDR fetch,
// GLB parse, Cloudflare-rewritten script, WebGL init, ...) shows up on screen
// and in the console instead of disappearing silently.
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[RootErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          padding: "24px",
          background: "#050507",
          color: "#f5f5f5",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "13px",
          lineHeight: 1.5,
          overflow: "auto",
          zIndex: 9999,
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: "15px", letterSpacing: "0.08em" }}>
          aMBiW — scene failed to start
        </h1>
        <p style={{ margin: "0 0 8px", color: "rgba(245,245,245,0.72)" }}>
          The 3D scene could not initialise on this device. The details below
          are captured for diagnostics.
        </p>
        <pre
          style={{
            margin: "12px 0 0",
            padding: "12px",
            background: "#0c0c10",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "#ffc9cf",
            fontSize: "12px",
          }}
        >
          {error.name}: {error.message}
          {"\n\n"}
          {error.stack ?? "(no stack trace available)"}
        </pre>
      </div>
    );
  }
}
