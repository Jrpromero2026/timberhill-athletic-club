import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { WizardProgress } from "@/components/setup/wizard-progress";
import { UploadForm } from "@/app/performance-operations/imports/new/upload-form";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { hasPermissionInOrganization } from "@/lib/authz/authz";

export const metadata: Metadata = { title: "Upload your schedule" };

/**
 * Setup step 2.
 *
 * Reuses the shipped upload form and the shipped `uploadImportFile`
 * action rather than forking them — the wizard's upload IS the ordinary
 * import, so duplicate-file detection, adapter detection, staging, and
 * matching all behave identically. What the wizard adds is framing: this
 * upload exists to teach the system your trainers and services, and the
 * next two steps read what it found.
 */
export default async function SetupUploadPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Upload your schedule" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Upload your schedule" />;

  const organization = context.options.find((o) => o.id === organizationId);
  if (!organization) return <PermissionDenied title="Upload your schedule" />;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "import:upload")) {
    return <PermissionDenied title="Upload your schedule" />;
  }

  const { data: batches } = await actor.supabase
    .from("import_batches")
    .select("id, original_filename, status, uploaded_at")
    .eq("organization_id", organizationId)
    .order("uploaded_at", { ascending: false })
    .limit(3);

  const existing = batches ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress
        currentStep={2}
        completedSteps={[1]}
        organizationId={organizationId}
      />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Upload your schedule</h1>
        <p className="mt-2 text-ink-secondary">
          Export your appointments from your scheduling system and upload the
          file. We&rsquo;ll read it and show you the trainers and services it
          contains &mdash; you won&rsquo;t type any of them by hand.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Nothing is charged to payroll from this step. The file is parsed and
          held for your review; you approve before anything counts.
        </p>
      </header>

      <UploadForm
        organizations={[{ id: organization.id, name: organization.name }]}
        defaultOrganizationId={organization.id}
      />

      {existing.length > 0 && (
        <section aria-label="Uploaded files" className="mt-8 border-t border-border pt-6">
          <h2 className="mb-3 text-base font-semibold text-ink">Already uploaded</h2>
          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
            {existing.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="truncate text-sm text-ink">{batch.original_filename}</span>
                <span className="shrink-0 text-sm text-ink-muted">{batch.status}</span>
              </li>
            ))}
          </ul>
          <Link
            href={`/performance-operations/setup/${organizationId}/trainers`}
            data-testid="setup-continue"
            className="mt-4 inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong"
          >
            Continue: review trainers
          </Link>
        </section>
      )}
    </div>
  );
}
