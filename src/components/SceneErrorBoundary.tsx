import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  message: string;
}

// Catches errors raised outside R3F's internal root — e.g. during
// GarageScene mount, prop validation, or any code around the <Canvas>. On
// error we keep the page alive with a dark background so the DOM overlay
// (brand / controls / credits) stays usable while the 3D scene is out.
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: `${error.name}: ${error.message}`,
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[SceneErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#050507",
        }}
        aria-hidden="true"
      />
    );
  }
}
