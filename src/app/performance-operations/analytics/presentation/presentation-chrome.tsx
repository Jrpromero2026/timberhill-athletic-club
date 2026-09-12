"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";

/**
 * Presentation chrome: overlays the app shell (fixed, top layer) with
 * minimal controls — exit, fullscreen, and Print/PDF (browser print
 * handles PDF export and page breaks). Content itself is server-rendered.
 */
export function PresentationChrome({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  const enterFullscreen = useCallback(() => {
    rootRef.current?.requestFullscreen?.().catch(() => {
      // Fullscreen refusals (permissions/iframes) are non-fatal.
    });
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 overflow-y-auto bg-surface print:static print:overflow-visible"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2 backdrop-blur print:hidden">
        <Link
          href="/performance-operations/analytics"
          className="text-sm font-medium text-ink-secondary hover:text-ink"
          data-testid="presentation-exit"
        >
          ← Exit presentation
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={enterFullscreen}
            className="h-8 rounded-[--radius-control] border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken"
          >
            Fullscreen
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-8 rounded-[--radius-control] bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-strong"
            data-testid="presentation-print"
          >
            Print / PDF
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
