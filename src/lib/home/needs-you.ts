/**
 * Home — pure rules for the "Needs you" list, the upcoming dates and the
 * data-freshness line. Every count comes from the package audit views.
 */
import type { PackageAuditSummary } from "@/lib/package-audit/balances";

const AUDIT = "/performance-operations/package-audit";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface NeedsYouItem {
  text: string;
  href: string;
}

export interface NeedsYouInput {
  summary: PackageAuditSummary;
  /** Latest Setmore sync, if any. */
  lastSync: { status: string; started_at: string } | null;
  /** When the newest GMS purchase line was imported, if any. */
  lastGmsImportAt: string | null;
  now: Date;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? null : Math.floor((now.getTime() - then) / DAY);
}

/** What to act on, most urgent first. Empty when nothing needs attention. */
export function needsYou(input: NeedsYouInput): NeedsYouItem[] {
  const { summary, lastSync, lastGmsImportAt, now } = input;
  const items: NeedsYouItem[] = [];

  if (!lastSync) {
    items.push({ text: "Setmore has never synced.", href: AUDIT });
  } else if (lastSync.status !== "succeeded") {
    items.push({ text: "Last night's Setmore sync failed.", href: AUDIT });
  } else if (now.getTime() - new Date(lastSync.started_at).getTime() > 36 * HOUR) {
    items.push({
      text: "Setmore has not synced in over a day. Balances may be stale.",
      href: AUDIT,
    });
  }

  const gmsAge = daysSince(lastGmsImportAt, now);
  if (gmsAge === null) {
    items.push({ text: "No GMS export has been imported.", href: AUDIT });
  } else if (gmsAge > 7) {
    items.push({
      text: `The GMS export is ${gmsAge} days old. Send a new one.`,
      href: AUDIT,
    });
  }

  if (summary.heldNoPackage > 0) {
    items.push({
      text: `${plural(summary.heldNoPackage, "client on hold has", "clients on hold have")} no package linked. Check the name matches GMS.`,
      href: `${AUDIT}?status=held`,
    });
  }
  if (summary.heldWithPackage > 0) {
    items.push({
      text: `${plural(summary.heldWithPackage, "client is", "clients are")} more than 2 sessions past their package.`,
      href: `${AUDIT}?status=held`,
    });
  }
  if (summary.lengthMismatch > 0) {
    items.push({
      text: `${plural(summary.lengthMismatch, "client is", "clients are")} booked at the wrong session length.`,
      href: `${AUDIT}?status=length_mismatch`,
    });
  }
  return items;
}

export interface Milestone {
  /** YYYY-MM-DD, Pacific. */
  date: string;
  label: string;
}

/** The audit trial and launch dates. */
export const MILESTONES: readonly Milestone[] = [
  { date: "2026-11-23", label: "First Monday digest and trainer notice preview, to you only" },
  { date: "2026-11-30", label: "First trainer Slack notices and the November trial close" },
  { date: "2026-12-14", label: "Trainers confirm client balances" },
  { date: "2026-12-31", label: "December close and opening balances for 2027" },
  { date: "2027-01-01", label: "Holds go live with the new rates" },
];

/** Today's date in Pacific time, as YYYY-MM-DD. */
export function pacificToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The next few dates, today included. */
export function comingUp(
  milestones: readonly Milestone[],
  now: Date,
  limit = 3,
): Milestone[] {
  const today = pacificToday(now);
  return milestones
    .filter((m) => m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
