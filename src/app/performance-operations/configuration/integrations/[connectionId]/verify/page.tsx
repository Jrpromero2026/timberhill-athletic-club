import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { SetmoreVerificationPanel } from "@/components/integrations/setmore-verification";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { runSetmoreVerification } from "@/lib/actions/setmore-verification";
import {
  SETMORE_API_LIVE_VERIFIED,
  SETMORE_LIVE_VERIFICATION_CHECKLIST,
} from "@/lib/integrations/providers/setmore";

export const metadata: Metadata = { title: "Setmore API verification" };

/**
 * The bridge between "credentials stored" and "integration enabled".
 *
 * Enablement is a code change, deliberately: it must be reviewed, and it
 * must record its evidence. This page produces that evidence.
 */
export default async function SetmoreVerifyPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Setmore API verification" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Setmore API verification" />;

  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, name, organization_id, provider_key, status, secret_ref")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return <PermissionDenied title="Setmore API verification" />;

  if (
    !hasPermissionInOrganization(
      context.memberships,
      connection.organization_id,
      "integration:manage_credentials"
    )
  ) {
    return <PermissionDenied title="Setmore API verification" />;
  }
  if (connection.provider_key !== "setmore_api") {
    return <PermissionDenied title="Setmore API verification" />;
  }

  const defaults = defaultWindow(new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setmore API verification"
        description={`Establish what the live Setmore account actually returns for "${connection.name}", before the integration is allowed to run.`}
        actions={
          <Link
            href={`/performance-operations/configuration/integrations/${connectionId}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border px-4 text-sm font-medium text-ink hover:border-accent"
          >
            Back to connection
          </Link>
        }
      />

      <section className="rounded-[--radius-card] border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Why this step exists</h2>
        <p className="mt-2 text-sm text-ink-muted">
          The Setmore adapter is fail-closed: it will not sync until{" "}
          <code>SETMORE_API_LIVE_VERIFIED</code> is set to <code>true</code> in a reviewed
          commit. That gate blocks the very calls needed to decide whether the API can be
          trusted, so verification is a separate, narrower capability. This probe reads a
          small window, redacts everything identifying, and reports what it found. A human
          reads it, sets the mappings, and only then lifts the gate.
        </p>
        <p className="mt-3 text-sm">
          Current gate state:{" "}
          <strong className={SETMORE_API_LIVE_VERIFIED ? "text-positive" : "text-warning"}>
            {SETMORE_API_LIVE_VERIFIED ? "live-verified — sync enabled" : "not verified — sync blocked"}
          </strong>
        </p>
        {!connection.secret_ref && (
          <p className="mt-3 rounded-[--radius-control] bg-warning-soft px-3 py-2 text-sm text-warning">
            No credential is stored for this connection yet. Add the Setmore refresh token
            on the connection page first — it goes straight to the vault and is never shown
            again.
          </p>
        )}
      </section>

      <section className="rounded-[--radius-card] border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Run a probe</h2>
        <SetmoreVerificationPanel
          action={runSetmoreVerification}
          connectionId={connectionId}
          defaults={defaults}
        />
      </section>

      <section className="rounded-[--radius-card] border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Verification checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-muted">
          {SETMORE_LIVE_VERIFICATION_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Default to the previous whole calendar month — the densest useful window. */
function defaultWindow(todayIso: string): { startDate: string; endDate: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const endOfPrevious = new Date(Date.UTC(year, month - 1, 1) - 86_400_000);
  const startOfPrevious = new Date(
    Date.UTC(endOfPrevious.getUTCFullYear(), endOfPrevious.getUTCMonth(), 1)
  );
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: iso(startOfPrevious), endDate: iso(endOfPrevious) };
}
