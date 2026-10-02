import { describe, expect, it } from "vitest";
import { parseMd } from "@/lib/guide/parse";
import { parseSummary } from "@/lib/guide/summary";
import { parseTranslationQuery } from "@/lib/translations/query";
import { navSearchEntries } from "../nav-index";
import { docsSearchEntries } from "../docs-index";
import { previewGroups, searchGroups, searchTokens } from "../match";
import { highlightSegments, snippet } from "../highlight";
import { reconcileActive } from "../keys";
import { keyResultHref, type KeyHit } from "../key-href";
import { keySearchQuery, mergeKeyHits } from "@/lib/keys/search";
const project = { slug: "demo", name: "Demo", role: "OWNER" as const, archived: false };
const options = { activeSlug: "demo", userName: "Person" };
describe("검색 결과 시나리오", () => {
  it("settings demo는 이름·프로젝트 맥락을 가로질러 OWNER 설정으로 착지하고 두 필드를 칠한다", () => {
    const index = { ...navSearchEntries([project], options), docs: [] };
    const groups = searchGroups(index, "settings demo", options);
    expect(groups.map(g => g.kind)).toEqual(["menus"]);
    const row = groups[0]?.items[0];
    expect(row).toBeDefined();
    expect(row?.href).toBe("/projects/demo/settings");
    expect(highlightSegments(row?.title ?? "", searchTokens("settings demo")).filter(s => s.match).map(s => s.text)).toEqual(["Settings"]);
    expect(highlightSegments(row?.context ?? "", searchTokens("settings demo"))).toEqual([{ text: "Demo", match: true }]);
    expect(searchGroups({ ...navSearchEntries([{ ...project, role: "EDITOR" }], options), docs: [] }, "settings demo", options)).toEqual([]);
    expect(keySearchQuery("settings demo")).toEqual({ pattern: "%settings demo%" });
  });
  it("세 세션 상태 미리보기와 가이드 본문 검색·해시 착지가 같은 색인을 쓴다", () => {
    const docs = docsSearchEntries(parseSummary(parseMd("- [Guide](page.md)")), () => parseMd("# Guide\nIntroduction\n## Sync {#sync}\n" + "Before ".repeat(40) + "PUSH_TOKEN"));
    for (const memberships of [[project], [], null]) {
      const index = { ...navSearchEntries(memberships, options), docs };
      const preview = previewGroups(index, options);
      expect(preview.at(-1)?.items.map(e => e.href)).toEqual(["/docs/page", "/docs"]);
      const result = searchGroups(index, "push_token", options).at(-1)?.items[0];
      expect(result).toBeDefined();
      expect(result?.href).toBe("/docs/page#sync");
      const excerpt = snippet(result?.body ?? "", ["push_token"], 30);
      expect(excerpt).toContain("PUSH_TOKEN");
      expect(highlightSegments(excerpt ?? "", ["push_token"]).filter(s => s.match).map(s => s.text)).toEqual(["PUSH_TOKEN"]);
    }
  });
  it("번역값 후반 일치·동명이 다른 키·늦은 그룹은 선택을 보존하고 필터 없는 키 선택으로 착지한다", () => {
    const value = "Before ".repeat(40) + "settings demo";
    const hit: KeyHit = { id: "a", key: "button", namespace: "billing", sourceText: "Pay now", surfaceSlug: "main", slug: "demo", name: "Demo", inKey: false, localeCode: "en", value };
    const hits = mergeKeyHits([], [hit, { ...hit, id: "b" }], "demo");
    expect(hits.map(h => h.id)).toEqual(["a", "b"]);
    const excerpt = snippet(hits[0]?.value ?? "", ["settings demo"], 30);
    expect(excerpt).toContain("settings demo");
    expect(highlightSegments(excerpt ?? "", ["settings demo"]).filter(s => s.match).map(s => s.text)).toEqual(["settings demo"]);
    expect(reconcileActive(["menu"], ["menu", ...hits.map(h => h.id)], "menu", false)).toBe("menu");
    const url = new URL(keyResultHref(hit), "https://example.com");
    expect(parseTranslationQuery(Object.fromEntries(url.searchParams))).toEqual({ ns: "billing", scope: "project", completion: "all", key: "a", keySurface: "main" });
  });
});
