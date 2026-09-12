import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { SETUP_STEPS, WizardProgress } from "@/components/setup/wizard-progress";
import { getActorContext } from "@/lib/actions/shared";
import {
  getConfigStats,
  isSetupComplete,
  nextIncompleteStep,
  readinessChecklist,
} from "@/lib/data/config-stats";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Set up your gym" };

/**
 * Wizard hub for an existing organization.
 *
 * Shows where setup stands and what to do next. The state comes entirely
 * from `readinessChecklist()` — the wizard has no progress store of its
 * own to drift out of sync, and an owner who completes work outside the
 * wizard sees it reflected here.
 */
export default async function SetupHubPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Set up your gym" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Set up your gym" />;

  const organization = context.options.find((o) => o.id === organizationId);
  if (!organization) return <PermissionDenied title="Set up your gym" />;

  const [stats] = await getConfigStats(actor, [
    { id: organization.id, name: organization.name },
  ]);
  if (!stats) return <PermissionDenied title="Set up your gym" />;

  const checklist = readinessChecklist(stats);
  const complete = isSetupComplete(stats);
  const nextStep = nextIncompleteStep(stats);
  const currentStep = nextStep ?? 7;

  const completedSteps = SETUP_STEPS.map(({ step }) => step).filter((step) => {
    const items = checklist.filter((item) => item.wizardStep === step);
    return items.length > 0 && items.every((item) => item.done);
  });
  if (complete) completedSteps.push(7);

  const nextSlug = SETUP_STEPS.find((s) => s.step === currentStep)?.slug ?? "";
  const doneCount = checklist.filter((i) => i.done).length;

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress
        currentStep={currentStep}
        completedSteps={completedSteps}
        organizationId={organizationId}
      />

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">{organization.name}</h1>
        <p className="mt-2 text-ink-secondary">
          {complete
            ? "Setup is complete. You can run payroll for this organization."
            : "Here's what's left before you can run payroll."}
        </p>
      </header>

      <section aria-label="Setup progress" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink">Progress</h2>
          <span className="text-sm text-ink-muted" data-testid="setup-progress-count">
            {doneCount} of {checklist.length} complete
          </span>
        </div>
        <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
          {checklist.map((item) => (
            <li
              key={item.label}
              data-testid="readiness-item"
              data-done={item.done}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="flex items-center gap-3 text-sm text-ink">
                <span
                  aria-hidden="true"
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                    item.done
                      ? "bg-positive-soft text-positive"
                      : "bg-surface-sunken text-ink-faint",
                  ].join(" ")}
                >
                  {item.done ? "✓" : "•"}
                </span>
                {item.label}
                <span className="sr-only">{item.done ? "complete" : "not complete"}</span>
              </span>
              {item.detail && (
                <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                  {item.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {complete ? (
        <Link
          href="/performance-operations/overview"
          data-testid="setup-finish"
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong"
        >
          Go to your dashboard
        </Link>
      ) : (
        <Link
          href={nextSlug ? `/performance-operations/setup/${organizationId}/${nextSlug}` : `/performance-operations/setup/${organizationId}`}
          data-testid="setup-continue"
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong"
        >
          Continue: {SETUP_STEPS.find((s) => s.step === currentStep)?.label}
        </Link>
      )}
    </div>
  );
}
