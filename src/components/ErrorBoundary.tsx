import { Component, type ReactNode } from "react";
import { buttonClass } from "@/components/Form";

// Shown in place of a page whose content failed to load (back end down, a dropped connection).
// The header and footer sit outside it, so visitors can still go elsewhere. Moving to another page
// (a new `resetKey`) or pressing Try again renders the page afresh, which retries its requests.
export default class ErrorBoundary extends Component<{ resetKey?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Content could not be loaded</h1>
        <p>Please try again in a moment. If it keeps happening, tell the site team.</p>
        <div>
          <button type="button" className={buttonClass} onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
