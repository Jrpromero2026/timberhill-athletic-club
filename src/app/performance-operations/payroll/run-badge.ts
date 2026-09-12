/** Payroll run status → StatusBadge style mapping. */
export const RUN_BADGE: Record<string, string> = {
  draft: "draft",
  calculating: "draft",
  needs_review: "closed",
  ready_for_approval: "open",
  approved: "open",
  posted: "active",
  locked: "locked",
  reopened: "closed",
  superseded: "inactive",
  failed: "locked",
  voided: "inactive",
};
