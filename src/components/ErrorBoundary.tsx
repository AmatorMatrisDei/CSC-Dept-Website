import { Component, type ReactNode } from "react";

// Shown when content fails to load (back end down, missing env vars).
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Content could not be loaded</h1>
        <p>Please try again in a moment. If it keeps happening, tell the site team.</p>
      </div>
    );
  }
}
