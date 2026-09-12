import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { WizardProgress } from "@/components/setup/wizard-progress";
import { ServiceReview } from "@/components/setup/service-review";
import { getActorContext } from "@/lib/actions/shared";
import { getLatestBatchDiscovery } from "@/lib/data/setup-discovery";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { hasPermissionInOrganization } from "@/lib/authz/authz";

export const metadata: Metadata = { title: "Review services" };

/**
 * Setup step 4 — confirm the services the schedule contains, and group
 * the spellings that mean the same thing.
 */
export default async function SetupServicesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Review services" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Review services" />;

  const organization = context.options.find((o) => o.id === organizationId);
  if (!organization) return <PermissionDenied title="Review services" />;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "service:manage")) {
    return <PermissionDenied title="Review services" />;
  }

  const discovery = await getLatestBatchDiscovery(actor, organizationId);

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress
        currentStep={4}
        completedSteps={[1, 2, 3]}
        organizationId={organizationId}
      />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Review services</h1>
        {discovery ? (
          <p className="mt-2 text-ink-secondary">
            We found {discovery.totals.servicesDetected} service
            {discovery.totals.servicesDetected === 1 ? "" : "s"} in your
            schedule. If your schedule writes one service several ways, group
            them so they all count together.
          </p>
        ) : (
          <p className="mt-2 text-ink-secondary">
            Upload a schedule first and we&rsquo;ll show you the services it
            contains.
          </p>
        )}
      </header>

      {discovery ? (
        <ServiceReview
          organizationId={organizationId}
          discovered={discovery.services}
          clusters={discovery.aliasClusters}
          continueHref={`/performance-operations/setup/${organizationId}/compensation`}
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
