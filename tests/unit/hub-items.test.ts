import { describe, expect, it } from "vitest";
import {
  groupItems,
  parseNewItem,
  isInternalUrl,
  isSafeUrl,
  itemMonth,
  noteLines,
  splitItems,
  type HubItem,
} from "@/lib/hub/items";

const item = (over: Partial<HubItem>): HubItem => ({
  id: "1",
  kind: "link",
  title: "T",
  summary: null,
  body: null,
  url: "https://example.com",
  source: null,
  item_date: null,
  sort: 1,
  group_name: null,
  ...over,
});

describe("hub items", () => {
  it("splits a note into one point per line", () => {
    expect(noteLines("a\n\n  b  \n")).toEqual(["a", "b"]);
    expect(noteLines(null)).toEqual([]);
  });

  it("only renders https and in-hub links", () => {
    expect(isSafeUrl("https://claude.ai/x")).toBe(true);
    expect(isSafeUrl("/personal-training")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("//evil.example")).toBe(false);
    expect(isSafeUrl("http://plain.example")).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isInternalUrl("/x")).toBe(true);
  });

  it("drops links with unsafe addresses and keeps notes", () => {
    const { notes, links } = splitItems([
      item({ id: "a" }),
      item({ id: "b", url: "javascript:alert(1)" }),
      item({ id: "c", kind: "note", url: null }),
    ]);
    expect(links.map((l) => l.id)).toEqual(["a"]);
    expect(notes.map((n) => n.id)).toEqual(["c"]);
  });

  it("formats the item month", () => {
    expect(itemMonth("2026-11-17")).toBe("Nov 2026");
    expect(itemMonth(null)).toBe("");
  });
});

describe("groupItems", () => {
  it("returns one unnamed group when nothing is grouped", () => {
    const groups = groupItems([item({ id: "a" }), item({ id: "n", kind: "note", url: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeNull();
    expect(groups[0].links).toHaveLength(1);
    expect(groups[0].notes).toHaveLength(1);
  });

  it("orders groups by their first item and puts ungrouped items under Other", () => {
    const groups = groupItems([
      item({ id: "c", sort: 30, group_name: "Print" }),
      item({ id: "a", sort: 10, group_name: "Brand", kind: "note", url: null }),
      item({ id: "b", sort: 20, group_name: "Brand" }),
      item({ id: "z", sort: 5 }),
      item({ id: "bad", sort: 1, group_name: "Brand", url: "javascript:alert(1)" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Brand", "Print", "Other"]);
    expect(groups[0].notes.map((n) => n.id)).toEqual(["a"]);
    expect(groups[0].links.map((l) => l.id)).toEqual(["b"]);
  });

  it("is empty when there is nothing to show", () => {
    expect(groupItems([])).toEqual([]);
  });
});

describe("parseNewItem", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it("makes a link when a link is given", () => {
    expect(
      parseNewItem(form({ section: "marketing", title: " Flyer ", url: "https://example.com/x", details: "v3", group: "Print" })),
    ).toEqual({ section: "marketing", kind: "link", title: "Flyer", url: "https://example.com/x", summary: "v3", body: null, group_name: "Print" });
  });

  it("makes a note when there is no link", () => {
    expect(parseNewItem(form({ section: "trainers", title: "Rule", details: "a\nb" }))).toMatchObject({
      kind: "note",
      body: "a\nb",
      url: null,
      group_name: null,
    });
  });

  it("rejects bad sections, unsafe links and empty items", () => {
    expect(parseNewItem(form({ section: "admin", title: "x", url: "https://e.com" }))).toEqual({ error: "Unknown section." });
    expect(parseNewItem(form({ section: "projects", title: "x", url: "javascript:alert(1)" }))).toHaveProperty("error");
    expect(parseNewItem(form({ section: "projects", title: "x", url: "http://plain.example" }))).toHaveProperty("error");
    expect(parseNewItem(form({ section: "projects", title: "", url: "https://e.com" }))).toHaveProperty("error");
    expect(parseNewItem(form({ section: "projects", title: "x" }))).toEqual({ error: "Add a link, or write the note." });
  });
});
