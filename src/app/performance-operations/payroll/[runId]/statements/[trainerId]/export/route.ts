import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  buildTrainerStatementCsv,
  loadRunStatementContext,
  loadTrainerStatement,
  recordExport,
} from "@/lib/payroll/statements";

/**
 * Trainer statement CSV export. Allowed for payroll:export holders, or the
 * trainer's own statement once the run is posted/locked.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; trainerId: string }> },
) {
  const { runId, trainerId } = await params;
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

  const canExport = hasPermissionInOrganization(
    memberships,
    context.run.organization_id,
    "payroll:export",
  );
  let selfAccess = false;
  if (!canExport) {
    const { data: self } = await actor.supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", actor.userId)
      .maybeSingle();
    selfAccess =
      self?.id === trainerId && ["posted", "locked"].includes(context.run.status);
  }
  if (!canExport && !selfAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const statement = await loadTrainerStatement(actor, runId, trainerId);
  if (!statement) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const csv = buildTrainerStatementCsv(context, statement);
  await recordExport(actor, context.run, "trainer_statement_csv", trainerId);

  const safeName = statement.trainerName.replaceAll(/[^\w.-]+/g, "_").slice(0, 40);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
