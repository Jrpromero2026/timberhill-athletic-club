import { describe, expect, it } from "vitest";
import {
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
