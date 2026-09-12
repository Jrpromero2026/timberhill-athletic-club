import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { NewTimeEntryForm, TimeDecisionForms, VoidTimeEntryButton } from "./time-forms";

export const metadata: Metadata = { title: "Manual time entries" };

const STATUS_CLASS: Record<string, string> = {
  submitted: "text-info",
  approved: "text-positive",
  included: "text-positive",
  rejected: "text-negative",
  voided: "text-ink-muted",
  draft: "text-ink-muted",
};

export default async function ManualTimePage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Manual time entries" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Manual time entries" description="Select a single workspace first." />
        <EmptyState title="Choose a workspace" description="Time entries are managed per organization." />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  const canManage = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:manage_time",
  );
  const canApprove = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:approve_time",
  );
  if (!canManage && !canApprove) return <PermissionDenied title="Manual time entries" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Manual time entries" />;

  const period = await getPeriodContext(context);
  const selectedPeriod = period.selected;

  const { data: selfTrainer } = await actor.supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", actor.userId)
    .maybeSingle();

  const { data: trainerRows } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("trainer_id, trainers ( id, display_name )")
    .eq("organization_id", organizationId)
    .is("effective_to", null);
  const trainers = (trainerRows ?? [])
    .flatMap((row) => {
      const t = row.trainers as unknown as { id: string; display_name: string } | null;
      return t ? [{ id: t.id, name: t.display_name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const trainerName = new Map(trainers.map((t) => [t.id, t.name]));

  const entriesQuery = actor.supabase
    .from("manual_time_entries")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: entries } = selectedPeriod
    ? await entriesQuery.eq("reporting_period_id", selectedPeriod.id)
    : await entriesQuery;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manual time entries"
        description="Non-session work (admin, programming, meetings…) submitted by trainers and approved before payroll can pay it."
        actions={
          <Link
            href="/performance-operations/payroll"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Payroll
          </Link>
        }
      />

      {!selectedPeriod ? (
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header to log and review time entries for it."
        />
      ) : (
        <>
          {canManage && (
            <NewTimeEntryForm
              organizationId={organizationId}
              periodId={selectedPeriod.id}
              periodRange={{ start: selectedPeriod.startDate, end: selectedPeriod.endDate }}
              trainers={trainers}
              selfTrainerId={selfTrainer?.id ?? null}
              canApprove={canApprove}
            />
          )}

          {(entries ?? []).length === 0 ? (
            <EmptyState
              title="No time entries in this period"
              description="Submitted entries appear here for approval; approved entries are picked up by the next payroll calculation."
            />
          ) : (
            <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2 font-medium">Trainer</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Requested</th>
                    <th className="px-4 py-2 font-medium">Approved</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(entries ?? []).map((entry) => (
                    <tr key={entry.id} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {trainerName.get(entry.trainer_id) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.work_date}</td>
                      <td className="px-4 py-2.5 text-xs">{entry.work_category.replaceAll("_", " ")}</td>
                      <td className="max-w-56 px-4 py-2.5 text-xs text-ink-secondary">{entry.description}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.requested_minutes} min</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {entry.approved_minutes === null ? "—" : `${entry.approved_minutes} min`}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${STATUS_CLASS[entry.status] ?? ""}`}>
                          {entry.status}
                        </span>
                        {entry.rejection_reason && (
                          <p className="text-[11px] text-ink-muted">{entry.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          {canApprove && entry.status === "submitted" && (
                            <TimeDecisionForms
                              entryId={entry.id}
                              requestedMinutes={entry.requested_minutes}
                            />
                          )}
                          {["draft", "submitted", "approved"].includes(entry.status) && (
                            <VoidTimeEntryButton entryId={entry.id} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
