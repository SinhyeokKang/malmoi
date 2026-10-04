import { describe, expect, it } from "vitest";
import { parseMd } from "@/lib/guide/parse";
import { parseSummary } from "@/lib/guide/summary";
import { parseTranslationQuery } from "@/lib/translations/query";
import { navSearchEntries } from "../nav-index";
import { docsSearchEntries } from "../docs-index";
import { searchRows, type SearchSegments } from "../rows";
import { highlightSegments, snippet } from "../highlight";
import { reconcileActive } from "../keys";
import { keyResultHref, type KeyHit } from "../key-href";
import { keySearchQuery, mergeKeyHits } from "@/lib/keys/search";
import { en } from "@/messages/en";
const project = { slug: "demo", name: "Demo", role: "OWNER" as const, archived: false };
const marks = (segments: SearchSegments | undefined) => (segments ?? []).filter(s => s.match).map(s => s.text);
const text = (segments: SearchSegments | undefined) => (segments ?? []).map(s => s.text).join("");
const options = { activeSlug: "demo", userName: "Person" };
describe("검색 결과 시나리오", () => {
  // 시나리오는 렌더가 실제로 쓰는 행 모델(`searchRows`)까지 간다 — 어느 필드를 칠하나(C7)가 여기서 정해진다(R-B1 Y1).
  it("settings demo는 이름·프로젝트 맥락을 가로질러 OWNER 설정으로 착지하고 두 필드를 칠한다", () => {
    const index = { ...navSearchEntries(en, [project], options), docs: [] };
    const result = searchRows(en, { index, keys: [], q: "settings demo", activeSlug: options.activeSlug });
    expect(result.groups.map(g => g.kind)).toEqual(["pages"]);
    const row = result.groups[0]?.rows[0];
    expect(row).toBeDefined();
    expect(row?.href).toBe("/projects/demo/settings");
    expect(marks(row?.title)).toEqual(["Settings"]);
    expect(row?.context).toEqual([{ text: "Demo", match: true }]);
    expect(row?.description).toBeUndefined();
    expect(result.ids).toEqual([row?.id]);
    // Projects는 이름만 칠한다 — slug 맥락은 원문 그대로다.
    const projects = searchRows(en, { index, keys: [], q: "demo", activeSlug: options.activeSlug }).groups.find(g => g.kind === "projects")?.rows[0];
    expect(marks(projects?.title)).toEqual(["Demo"]);
    expect(projects?.context).toEqual([{ text: "demo", match: false }]);
    expect(searchRows(en, { index: { ...navSearchEntries(en, [{ ...project, role: "EDITOR" }], options), docs: [] }, keys: [], q: "settings demo", activeSlug: null }).groups).toEqual([]);
    expect(keySearchQuery("settings demo")).toEqual({ pattern: "%settings demo%" });
  });
  it("세 세션 상태 미리보기와 가이드 본문 검색·해시 착지가 같은 색인을 쓴다", () => {
    const docs = docsSearchEntries(parseSummary(parseMd("- [Guide](page.md)")), () => parseMd("# Guide\nIntroduction\n## Sync {#sync}\n" + "Before ".repeat(40) + "PUSH_TOKEN"));
    for (const memberships of [[project], [], null]) {
      const index = { ...navSearchEntries(en, memberships, options), docs };
      const preview = searchRows(en, { index, keys: [], q: "", activeSlug: options.activeSlug });
      expect(preview.groups.at(-1)?.rows.map(e => e.href)).toEqual(["/docs/page", "/docs"]);
      const found = searchRows(en, { index, keys: [], q: "push_token", activeSlug: options.activeSlug });
      expect(found.groups.map(g => g.kind)).toEqual(["docs"]);
      const row = found.groups[0]?.rows[0];
      expect(row?.href).toBe("/docs/page#sync");
      expect(text(row?.title)).toBe("Guide");
      expect(row?.context).toEqual([{ text: "Sync", match: false }]);
      expect(text(row?.description)).toContain("PUSH_TOKEN");
      expect(text(row?.description).length).toBeLessThan(200);
      expect(marks(row?.description)).toEqual(["PUSH_TOKEN"]);
    }
  });
  // 실제 SUMMARY는 개요(`README.md` → `/docs`)로 시작한다 — 미리보기의 `/docs` 행은 `Go to docs` 하나다(D8 · R-B1 Y2).
  it("실제 SUMMARY 모양에서도 미리보기의 /docs 행은 Go to docs 하나다", () => {
    const docs = docsSearchEntries(parseSummary(parseMd("- [Malmoi](README.md)\n- [Guide](page.md)")), () => parseMd("# Page\nIntroduction"));
    expect(docs.map(d => d.href)).toContain("/docs");
    for (const memberships of [[project], [], null]) {
      const preview = searchRows(en, { index: { ...navSearchEntries(en, memberships, options), docs }, keys: [], q: "", activeSlug: options.activeSlug });
      const rows = preview.groups.flatMap(g => g.rows);
      expect(rows.filter(r => r.href === "/docs").map(r => r.id)).toEqual(["go-to-docs"]);
      expect(preview.groups.at(-1)?.rows.map(r => r.href)).toEqual(["/docs/page", "/docs"]);
    }
  });
  it("번역값 후반 일치·동명이 다른 키·늦은 그룹은 선택을 보존하고 필터 없는 키 선택으로 착지한다", () => {
    const value = "Before ".repeat(40) + "settings demo";
    const hit: KeyHit = { id: "a", key: "button", namespace: "billing", sourceText: "Pay now", surfaceSlug: "main", slug: "demo", name: "Demo", inKey: false, localeCode: "en", value };
    const hits = mergeKeyHits([], [hit, { ...hit, id: "b" }], "demo");
    expect(hits.map(h => h.id)).toEqual(["a", "b"]);
    const index = { ...navSearchEntries(en, [project], options), docs: [] };
    const before = searchRows(en, { index, keys: [], q: "settings demo", activeSlug: options.activeSlug });
    const after = searchRows(en, { index, keys: hits, q: "settings demo", activeSlug: options.activeSlug });
    expect(after.groups.map(g => g.kind)).toEqual(["pages", "keys"]);
    const row = after.groups[1]?.rows[0];
    expect(row?.id).toBe("key:a");
    expect(row?.locale).toBe("en");
    expect(text(row?.title)).toBe("button");
    expect(row?.context).toEqual([{ text: "Demo · main", match: false }]);
    expect(text(row?.description)).toContain("settings demo");
    expect(marks(row?.description)).toEqual(["settings demo"]);
    const pageId = before.ids[0]!;
    expect(pageId).toBe("page:demo:settings");
    // 사용자가 옮겨 둔 행은 늦게 온 Keys에도 그대로다 — 옮기기 전이면 첫 행을 따른다(여기선 첫 행도 같은 Pages 행이다).
    expect(reconcileActive(after.ids, { activeId: pageId, moved: true }, false)).toEqual({ activeId: pageId, moved: true });
    expect(reconcileActive(after.ids, { activeId: pageId, moved: false }, false)).toEqual({ activeId: after.ids[0], moved: false });
    expect(row?.href).toBe(keyResultHref(hit));
    const url = new URL(row?.href ?? "", "https://example.com");
    expect(parseTranslationQuery(Object.fromEntries(url.searchParams))).toEqual({ ns: "billing", scope: "project", completion: "all", key: "a", keySurface: "main" });
  });
  it.each(["  ", "\t", "\n"])("Keys 전체 질의의 공백 %j를 원문·번역값 스니펫과 강조까지 유지한다", whitespace => {
    for (const q of [`settings${whitespace}demo`, "settings demo"]) {
      expect(keySearchQuery(`  ${q}  `)).toEqual({ pattern: `%${q}%` });
      const text = `false settings${q === "settings demo" ? whitespace : " "}demo ` + "Before ".repeat(40) + `actual ${q} After`;
      const hit: KeyHit = { id: "space", key: "button", namespace: "billing", sourceText: text, surfaceSlug: "main", slug: "demo", name: "Demo", inKey: false, localeCode: "en", value: text };
      const [result] = mergeKeyHits([], [hit], "demo");
      expect(result).toEqual(hit);
      for (const body of [result?.sourceText, result?.value]) {
        const excerpt = snippet(body ?? "", [q], 30);
        expect(excerpt).toContain(`actual ${q}`);
        expect(excerpt).not.toContain("false");
        expect(highlightSegments(excerpt ?? "", [q]).filter(s => s.match).map(s => s.text)).toEqual([q]);
        expect(excerpt?.replace(/\s+/g, " ")).toContain("actual settings demo");
      }
      const url = new URL(keyResultHref(hit), "https://example.com");
      expect(parseTranslationQuery(Object.fromEntries(url.searchParams))).toEqual({ ns: "billing", scope: "project", completion: "all", key: "space", keySurface: "main" });
    }
  });
});
