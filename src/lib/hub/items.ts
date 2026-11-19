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
  group_name: string | null;
}

export const HUB_SECTIONS: readonly HubSection[] = [
  "payroll",
  "audit",
  "trainers",
  "projects",
  "marketing",
  "reports",
];

/** The page each section's library is shown on. */
export const SECTION_PATH: Record<HubSection, string> = {
  payroll: "/performance-operations/payroll",
  audit: "/performance-operations/package-audit",
  trainers: "/performance-operations/sops",
  projects: "/performance-operations/projects",
  marketing: "/performance-operations/marketing",
  reports: "/performance-operations/reports",
};

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

export interface HubGroup {
  /** Heading, or null when the section has no groups at all. */
  name: string | null;
  notes: HubItem[];
  links: HubItem[];
}

/**
 * Items under their group heading, groups in the order of their first item.
 * Ungrouped items go last under "Other", unless nothing is grouped.
 */
export function groupItems(items: readonly HubItem[]): HubGroup[] {
  const { notes, links } = splitItems(items);
  const usable = [...notes, ...links].sort(
    (a, b) => a.sort - b.sort || a.title.localeCompare(b.title),
  );
  const anyGrouped = usable.some((item) => item.group_name);
  if (!anyGrouped) return usable.length ? [{ name: null, notes, links }] : [];

  const groups = new Map<string, HubGroup>();
  const other: HubGroup = { name: "Other", notes: [], links: [] };
  for (const item of usable) {
    const name = item.group_name?.trim();
    const group = name
      ? (groups.get(name) ?? groups.set(name, { name, notes: [], links: [] }).get(name)!)
      : other;
    (item.kind === "note" ? group.notes : group.links).push(item);
  }
  const result = [...groups.values()];
  if (other.notes.length + other.links.length > 0) result.push(other);
  return result;
}

export interface NewHubItem {
  section: HubSection;
  kind: "link" | "note";
  title: string;
  url: string | null;
  summary: string | null;
  body: string | null;
  group_name: string | null;
}

const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

/** Validate the add form. Returns the item, or the message to show. */
export function parseNewItem(form: FormData): NewHubItem | { error: string } {
  const section = text(form.get("section")) as HubSection;
  if (!HUB_SECTIONS.includes(section)) return { error: "Unknown section." };
  const title = text(form.get("title"));
  if (!title) return { error: "Give it a title." };
  if (title.length > 120) return { error: "Keep the title under 120 characters." };
  const group = text(form.get("group")).slice(0, 60) || null;
  const url = text(form.get("url"));
  const details = text(form.get("details"));

  if (url) {
    if (url.length > 500 || !isSafeUrl(url)) {
      return { error: "The link must start with https:// or be a page in the hub." };
    }
    if (details.length > 240) return { error: "Keep the description under 240 characters." };
    return { section, kind: "link", title, url, summary: details || null, body: null, group_name: group };
  }
  if (!details) return { error: "Add a link, or write the note." };
  if (details.length > 2000) return { error: "Keep the note under 2,000 characters." };
  return { section, kind: "note", title, url: null, summary: null, body: details, group_name: group };
}
