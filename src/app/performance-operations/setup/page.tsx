import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { OrganizationForm } from "@/components/setup/organization-form";
import { WizardProgress } from "@/components/setup/wizard-progress";
import { createOrganization } from "@/lib/actions/organizations";
import { getActorContext, actorIsPlatformAdmin } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Set up your gym" };

/**
 * Setup wizard, step 1.
 *
 * Organization creation had no UI before Phase 9.5 — organizations were
 * seeded by SQL. Creation is platform-admin only, matching the
 * `organizations_insert` RLS policy.
 */
export default async function SetupPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Set up your gym" />;
  const actor = await getActorContext();
  if (!actor || !actorIsPlatformAdmin(actor)) {
    return <PermissionDenied title="Set up your gym" />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress currentStep={1} completedSteps={[]} />

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Welcome to Performance Operations.</h1>
        <p className="mt-2 text-ink-secondary">
          Let&rsquo;s get your organization ready. Most gyms finish in 10&ndash;15 minutes.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          You&rsquo;ll upload a schedule export and confirm what we find in it &mdash;
          no typing out trainers or services by hand.
        </p>
      </header>

      <OrganizationForm action={createOrganization} />

      {context.options.length > 0 && (
        <p className="mt-8 border-t border-border pt-4 text-sm text-ink-muted">
          Already set up?{" "}
          <Link href="/performance-operations/overview" className="text-accent hover:underline">
            Go to your dashboard
          </Link>
          .
        </p>
      )}
    </div>
  );
}
