import { describe, expect, it } from "vitest";
import { keySearchQuery, mergeKeyHits } from "../search";
import { likePattern } from "../translation-list";
import { keyResultHref, type KeyHit } from "@/lib/search/key-href";
import { DEFAULT_TRANSLATION_QUERY, Q_MAX_LENGTH, translationsHref } from "@/lib/translations/query";
const hit = (id: string, extra: Partial<KeyHit> = {}): KeyHit => ({ id, key: "key", namespace: "ns", sourceText: "Source", surfaceSlug: "main", slug: "demo", name: "Demo", inKey: true, localeCode: null, value: null, ...extra });
describe("키 검색 순수 부분", () => {
  it("trim 뒤 두 글자·번역 화면과 같은 이스케이프·200자 상한", () => {
    for (const q of ["", "a", "  a "]) expect(keySearchQuery(q)).toBeNull();
    for (const q of ["50%_off", "a\\b", "settings demo"]) expect(keySearchQuery(` ${q} `)).toEqual({ pattern: likePattern(q) });
    expect(keySearchQuery("50%_off")).toEqual({ pattern: "%50\\%\\_off%" });
    expect(keySearchQuery("x".repeat(201))).toEqual({ pattern: likePattern("x".repeat(Q_MAX_LENGTH)) });
  });
  it("키 이름·원문·번역 순위와 현재 프로젝트·C 문자열·id 동점을 지킨다", () => {
    const first = [hit("source", { inKey: false, slug: "active" }), hit("key"), hit("current", { slug: "active" })];
    const second = [hit("translation", { inKey: false, localeCode: "ko", value: "문구", slug: "active" }), hit("key", { inKey: false })];
    expect(mergeKeyHits(first, second, "active").map(h => h.id)).toEqual(["current", "key", "source", "translation"]);
    const ties = ["f", "d", "c", "e", "b", "a"].map(id => hit(id));
    expect(mergeKeyHits(ties, [hit("ignored", { key: "aaa" })], null).map(h => h.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(mergeKeyHits([...ties].reverse(), [], null).map(h => h.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(mergeKeyHits([], ties.map(h => ({ ...h, inKey: false })), null).map(h => h.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(mergeKeyHits([hit("one"), hit("two")], [], null)).toHaveLength(2);
    expect(mergeKeyHits([hit("bmp", { key: "\ue000" }), hit("nonbmp", { key: "😀" })], [], null).map(h => h.id)).toEqual(["bmp", "nonbmp"]);
  });
  it("선택 키·소스·namespace만 싣고 검색·필터가 없는 번역 화면 주소", () => {
    const row = hit("key-id", { namespace: "a b" });
    const href = keyResultHref(row);
    expect(href).toBe(translationsHref(row.slug, row.surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns: row.namespace, key: row.id, keySurface: row.surfaceSlug }));
    const params = new URL(href, "https://example.com").searchParams;
    expect([...params.keys()].sort()).toEqual(["key", "keySurface", "ns"]);
  });
});
