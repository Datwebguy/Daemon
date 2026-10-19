"use client";

import { Component, type ReactNode } from "react";

/** Contains render errors (e.g. a malformed indexer row) so they can't take down the whole page. */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-dim">Couldn&apos;t display this item.</div>;
    }
    return this.props.children;
  }
}
