import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  buildDepartmentSummaryCsv,
  loadRunStatementContext,
  recordExport,
} from "@/lib/payroll/statements";

/** Department summary CSV export (permission: payroll:export). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const context = await loadRunStatementContext(actor, runId);
  if (!context) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: membershipRows } = await actor.supabase
    .from("organization_memberships")
    .select("organization_id, is_default, roles ( key )")
    .is("effective_to", null);
  const memberships = (membershipRows ?? []).flatMap((row) => {
    const role = row.roles as unknown as { key: string } | null;
    return role
      ? [{ organizationId: row.organization_id, roleKey: role.key as never, isDefault: row.is_default }]
      : [];
  });
  if (!hasPermissionInOrganization(memberships, context.run.organization_id, "payroll:export")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const csv = buildDepartmentSummaryCsv(context);
  await recordExport(actor, context.run, "department_csv", null);

  const safeName = context.run.name.replaceAll(/[^\w.-]+/g, "_").slice(0, 60);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="department-summary-${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
