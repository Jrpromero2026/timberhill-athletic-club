/** Hub library: row shape of `hub_items` and the pure helpers the page uses. */

export type HubSection =
  | "payroll"
  | "audit"
  | "trainers"
  | "projects"
  | "marketing"
  | "reports";

export interface HubItem {
  id: string;
  kind: "link" | "note";
  title: string;
  summary: string | null;
  body: string | null;
  url: string | null;
  source: string | null;
  item_date: string | null;
  sort: number;
}

/** A note's body is one point per line. */
export function noteLines(body: string | null): string[] {
  return (body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Links inside the hub open in place; everything else opens in a new tab. */
export function isInternalUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/** Only http(s) and in-hub paths are ever rendered as links. */
export function isSafeUrl(url: string | null): url is string {
  if (!url) return false;
  return isInternalUrl(url) || /^https:\/\//i.test(url);
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-17" -> "Nov 2026". */
export function itemMonth(date: string | null): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "" : MONTH_YEAR.format(parsed);
}

export function splitItems(items: readonly HubItem[]): {
  notes: HubItem[];
  links: HubItem[];
} {
  return {
    notes: items.filter((item) => item.kind === "note"),
    links: items.filter((item) => item.kind === "link" && isSafeUrl(item.url)),
  };
}
