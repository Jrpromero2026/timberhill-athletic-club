"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong"
    >
      Print / save PDF
    </button>
  );
}
