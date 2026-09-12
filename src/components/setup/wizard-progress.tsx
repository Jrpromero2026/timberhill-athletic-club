import Link from "next/link";

/**
 * Setup-wizard progress rail.
 *
 * Steps mirror `readinessChecklist()` via its `wizardStep` field, so the
 * rail and the readiness list can never disagree about what is done.
 * Completed steps stay navigable — an owner revisiting step 3 to add a
 * trainer should not have to restart.
 */

export const SETUP_STEPS = [
  { step: 1, label: "Create organization", slug: "" },
  { step: 2, label: "Upload schedule", slug: "upload" },
  { step: 3, label: "Review trainers", slug: "trainers" },
  { step: 4, label: "Review services", slug: "services" },
  { step: 5, label: "Configure compensation", slug: "compensation" },
  { step: 6, label: "Validate payroll", slug: "payroll" },
  { step: 7, label: "Ready", slug: "ready" },
] as const;

export function WizardProgress({
  currentStep,
  completedSteps,
  organizationId,
}: {
  currentStep: number;
  /** Steps whose readiness items all pass. */
  completedSteps: number[];
  /** Absent before the organization exists (step 1). */
  organizationId?: string;
}) {
  const done = new Set(completedSteps);

  return (
    <nav aria-label="Setup progress" className="mb-8">
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {SETUP_STEPS.map(({ step, label, slug }) => {
          const isCurrent = step === currentStep;
          const isDone = done.has(step);
          const reachable = organizationId !== undefined && (isDone || step < currentStep);

          const state = isCurrent ? "current" : isDone ? "done" : "upcoming";
          const marker = isDone && !isCurrent ? "✓" : String(step);

          const content = (
            <span
              data-testid={`setup-step-${step}`}
              data-state={state}
              className={[
                "flex items-center gap-2 rounded-[--radius-control] px-3 py-2 text-sm transition-colors",
                isCurrent
                  ? "bg-accent-soft font-medium text-accent"
                  : isDone
                    ? "text-ink-muted hover:bg-surface-sunken"
                    : "text-ink-faint",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  isCurrent
                    ? "bg-accent text-surface"
                    : isDone
                      ? "bg-positive-soft text-positive"
                      : "bg-surface-sunken text-ink-faint",
                ].join(" ")}
              >
                {marker}
              </span>
              {label}
            </span>
          );

          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined}>
              {reachable ? (
                <Link
                  href={slug ? `/performance-operations/setup/${organizationId}/${slug}` : `/performance-operations/setup/${organizationId}`}
                  className="block rounded-[--radius-control] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
