import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import type { MembershipGrant } from "@/lib/authz/authz";
import type { RoleKey } from "@/lib/authz/permissions";
import { buildCloseExport, type CloseExportType } from "@/lib/close/export-data";
import { writeAudit } from "@/lib/actions/shared";

/**
 * Verified export download: regenerates the file deterministically from
 * its frozen sources and VERIFIES the recorded sha256 before serving —
 * a mismatch means a frozen source was tampered with, and the download
 * is refused rather than serving unverifiable bytes. Downloads are
 * audited and counted. No public URLs; permission enforced per request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ closeRunId: string; exportId: string }> },
) {
  const { exportId } = await params;
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data: exportRow } = await actor.supabase
    .from("close_exports")
    .select("*")
    .eq("id", exportId)
    .maybeSingle();
  if (!exportRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: membershipRows } = await actor.supabase
    .from("organization_memberships")
    .select("organization_id, is_default, roles ( key )")
    .is("effective_to", null);
  const memberships: MembershipGrant[] = (membershipRows ?? []).flatMap((row) => {
    const role = row.roles as unknown as { key: string } | null;
    return role
      ? [{ organizationId: row.organization_id, roleKey: role.key as RoleKey, isDefault: row.is_default }]
      : [];
  });
  if (
    !hasPermissionInOrganization(memberships, exportRow.organization_id, "period_close:export")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [{ data: period }, { data: organization }] = await Promise.all([
    actor.supabase
      .from("reporting_periods")
      .select("id, label, start_date, end_date")
      .eq("id", exportRow.reporting_period_id)
      .maybeSingle(),
    actor.supabase
      .from("organizations")
      .select("name")
      .eq("id", exportRow.organization_id)
      .maybeSingle(),
  ]);
  if (!period) return NextResponse.json({ error: "period_not_found" }, { status: 404 });

  const built = await buildCloseExport(
    actor,
    exportRow.organization_id,
    organization?.name ?? "",
    period,
    exportRow.export_type as CloseExportType,
  );
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 409 });
  }
  // Integrity verification against the recorded hash. Superseded versions
  // regenerate the CURRENT state and thus may differ — they are served
  // only when their hash still matches (frozen sources unchanged).
  if (built.document.sha256 !== exportRow.sha256) {
    return NextResponse.json(
      {
        error: "integrity_mismatch",
        detail:
          "The regenerated file no longer matches this export version's recorded hash (a newer version supersedes it, or a frozen source changed).",
        recorded_sha256: exportRow.sha256,
        current_sha256: built.document.sha256,
      },
      { status: 409 },
    );
  }

  await actor.supabase
    .from("close_exports")
    .update({ download_count: exportRow.download_count + 1 })
    .eq("id", exportId);
  await writeAudit(actor, {
    organizationId: exportRow.organization_id,
    entityType: "close_export",
    entityId: exportRow.id,
    action: "close_export_downloaded",
    metadata: { export_type: exportRow.export_type, version: exportRow.version },
  });

  return new NextResponse(built.document.content, {
    headers: {
      "Content-Type": `${exportRow.mime_type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${exportRow.file_name}"`,
      "Cache-Control": "no-store",
      "X-Export-Sha256": exportRow.sha256,
      "X-Export-Version": String(exportRow.version),
    },
  });
}
