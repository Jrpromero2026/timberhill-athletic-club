import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { WizardProgress } from "@/components/setup/wizard-progress";
import { TrainerReview } from "@/components/setup/trainer-review";
import { getActorContext } from "@/lib/actions/shared";
import { getLatestBatchDiscovery } from "@/lib/data/setup-discovery";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { hasPermissionInOrganization } from "@/lib/authz/authz";

export const metadata: Metadata = { title: "Review trainers" };

/**
 * Setup step 3 — confirm the trainers the schedule contains.
 *
 * The list comes from the staged rows of the most recent upload, matched
 * against the existing roster by the shipped matching engine, so a name
 * that will match at import time is shown as already linked here.
 */
export default async function SetupTrainersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Review trainers" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Review trainers" />;

  const organization = context.options.find((o) => o.id === organizationId);
  if (!organization) return <PermissionDenied title="Review trainers" />;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "trainer:manage")) {
    return <PermissionDenied title="Review trainers" />;
  }

  const discovery = await getLatestBatchDiscovery(actor, organizationId);

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress
        currentStep={3}
        completedSteps={[1, 2]}
        organizationId={organizationId}
      />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Review trainers</h1>
        {discovery ? (
          <p className="mt-2 text-ink-secondary">
            We found {discovery.totals.trainersDetected} trainer
            {discovery.totals.trainersDetected === 1 ? "" : "s"} in{" "}
            <span className="text-ink">{discovery.batchFilename}</span>. Confirm
            who should be on your roster.
          </p>
        ) : (
          <p className="mt-2 text-ink-secondary">
            Upload a schedule first and we&rsquo;ll show you the trainers it
            contains.
          </p>
        )}
      </header>

      {discovery ? (
        <TrainerReview
          organizationId={organizationId}
          discovered={discovery.trainers}
          continueHref={`/performance-operations/setup/${organizationId}/services`}
        />
      ) : (
        <Link
          href={`/performance-operations/setup/${organizationId}/upload`}
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong"
        >
          Go to upload
        </Link>
      )}
    </div>
  );
}
