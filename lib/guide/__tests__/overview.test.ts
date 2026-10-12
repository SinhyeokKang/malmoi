import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OVERVIEW_TRACKS } from "@/lib/guide/overview";
import { parseMd } from "@/lib/guide/parse";
import { flattenNav, parseSummary } from "@/lib/guide/summary";

const nav = parseSummary(parseMd(readFileSync(join(process.cwd(), "guide/en/SUMMARY.md"), "utf8")));
const slugs = new Set(flattenNav(nav).map((item) => item.slug.join("/")));

describe("OVERVIEW_TRACKS — 개요의 두 갈래", () => {
  it("모든 slug가 SUMMARY에 있다 — 원고를 옮기면 개요가 404 카드를 들지 않는다", () => {
    const all = OVERVIEW_TRACKS.flatMap((track) => [track.chapter, ...track.pages]);
    expect(all.filter((slug) => !slugs.has(slug))).toEqual([]);
  });

  it("카드 머리는 최상위이며, 개발자는 호스트를 고르고 번역자는 장의 첫 할 일을 따른다", () => {
    for (const track of OVERVIEW_TRACKS) {
      const chapter = nav.find((node) => node.slug.join("/") === track.chapter);
      expect(chapter, track.chapter).toBeDefined();
      const choices = track.audience === "forDevelopers" ? nav : chapter!.children;
      const available = new Set(choices.map((child) => child.slug.join("/")));
      expect(track.pages.filter((page) => !available.has(page))).toEqual([]);
    }
  });

  /** 갈래 행은 SUMMARY 순서를 따른다 — 개요와 내비가 다른 순서를 말하면 어느 쪽이 먼저인지 모른다. */
  it("각 갈래의 행이 SUMMARY 순서다", () => {
    const order = flattenNav(nav).map((item) => item.slug.join("/"));
    for (const track of OVERVIEW_TRACKS) {
      const positions = track.pages.map((page) => order.indexOf(page));
      expect(positions, track.chapter).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("독자 두 갈래 — 개발자와 편집자", () => {
    expect(OVERVIEW_TRACKS.map((track) => track.audience)).toEqual(["forDevelopers", "forTranslators"]);
  });
});
