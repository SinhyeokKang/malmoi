import { describe, expect, it } from "vitest";

import { buildSearchText, SEARCH_TEXT_MAX } from "../search";
import type { EventPayload } from "../payload";

/**
 * 검색 문자열의 **유일한 관문** (결정 3). 적재 지점마다 다시 짜면 종류 하나가 조용히 검색에서 빠진다.
 */

const REF = "evt_2026abc";

describe("buildSearchText — 무엇이 들어가나", () => {
  it("참조는 어느 종류에나 들어간다", () => {
    const payloads: EventPayload[] = [
      { kind: "TRANSLATION", surfaceSlug: "web", key: "a.b", locale: "ko", before: null, after: "값" },
      { kind: "PUBLISH", surfaceSlugs: [], refusal: null },
      { kind: "MEMBER", targetLabel: "k***@a.com", role: null },
      { kind: "SETTINGS", field: "name", value: null },
      { kind: "SURFACE", surfaceSlug: "web", adapter: null, baseLocale: null },
      { kind: "IMPORT", source: "ci", surfaceSlugs: [], keys: null, pendingEdits: null, surfaces: [], errorCode: null, refusal: null },
    ];
    for (const payload of payloads) expect(buildSearchText(REF, payload), payload.kind).toContain(REF);
  });

  it("번역은 키·소스·로케일을 싣는다", () => {
    const text = buildSearchText(REF, { kind: "TRANSLATION", surfaceSlug: "web-app", key: "home.title", locale: "ko", before: "before", after: "after" });
    expect(text).toContain("home.title");
    expect(text).toContain("web-app");
    expect(text).toContain("ko");
  });

  /**
   * ⚠️ **번역 본문은 검색에 넣지 않는다** (spec §4 비목표 — 전문 검색은 이번 범위가 아니다).
   * 넣으면 이 컬럼이 번역 값의 두 번째 사본이 되고, 값 소유권이 흐려진다.
   */
  it("번역 전후 값은 넣지 않는다", () => {
    const text = buildSearchText(REF, { kind: "TRANSLATION", surfaceSlug: "web", key: "a", locale: "ko", before: "sekrit-before", after: "sekrit-after" });
    expect(text).not.toContain("sekrit-before");
    expect(text).not.toContain("sekrit-after");
  });

  it("적재는 소스 목록·실행 출처·오류 코드·거부 사유를 싣는다", () => {
    const text = buildSearchText(REF, {
      kind: "IMPORT", source: "ci", surfaceSlugs: ["web", "mobile"], keys: 12, pendingEdits: null,
      surfaces: [{ surfaceSlug: "web", status: "imported", count: 12, reason: null }],
      errorCode: "github-error", refusal: null,
    });
    for (const token of ["ci", "web", "mobile", "github-error"]) expect(text, token).toContain(token);
  });

  it("거부 사유는 검색된다 — 'Not started'를 찾는 길이 있어야 한다", () => {
    expect(buildSearchText(REF, { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: "not-installed" })).toContain("not-installed");
  });

  it("소스 사건은 어댑터와 base 로케일 전후를 싣는다", () => {
    const text = buildSearchText(REF, { kind: "SURFACE", surfaceSlug: "web", adapter: "json-catalog", baseLocale: { before: "en", after: "ko" } });
    for (const token of ["web", "json-catalog", "en", "ko"]) expect(text, token).toContain(token);
  });

  it("멤버 사건은 마스킹 라벨과 역할 전후를 싣는다", () => {
    const text = buildSearchText(REF, { kind: "MEMBER", targetLabel: "k***@a.com", role: { before: "EDITOR", after: "OWNER" } });
    for (const token of ["k***@a.com", "editor", "owner"]) expect(text, token).toContain(token);
  });

  it("설정 사건은 필드 이름과 전후 값을 싣는다", () => {
    const text = buildSearchText(REF, { kind: "SETTINGS", field: "name", value: { before: "Old name", after: "New name" } });
    for (const token of ["name", "old name", "new name"]) expect(text, token).toContain(token);
  });

  /** ⚠️ **토큰 값·해시·초대 링크는 payload에 없다** (T5c) — 값이 없으므로 검색에도 없다. */
  it("값 없는 설정 사건은 필드만 싣는다", () => {
    expect(buildSearchText(REF, { kind: "SETTINGS", field: "pushToken", value: null })).toBe(`${REF} pushtoken`);
  });
});

describe("buildSearchText — 모양", () => {
  const payload: EventPayload = { kind: "TRANSLATION", surfaceSlug: "Web", key: "Home.Title", locale: "KO", before: null, after: null };

  /** 조회가 `contains` 하나라, 대소문자를 여기서 접어야 술어가 한 벌로 끝난다. */
  it("소문자로 접는다", () => {
    expect(buildSearchText(REF, payload)).toBe(buildSearchText(REF, payload).toLowerCase());
    expect(buildSearchText(REF, payload)).toContain("home.title");
  });

  it("같은 값을 두 번 넣지 않는다", () => {
    const text = buildSearchText(REF, { kind: "SURFACE", surfaceSlug: "web", adapter: "web", baseLocale: { before: "web", after: "web" } });
    expect(text.split(" ").filter((token) => token === "web")).toHaveLength(1);
  });

  it("빈 값·공백은 토큰이 되지 않는다", () => {
    const text = buildSearchText(REF, { kind: "SURFACE", surfaceSlug: "web", adapter: "", baseLocale: { before: null, after: "  " } });
    expect(text).toBe(`${REF} web`);
  });

  it("같은 입력은 언제나 같은 문자열이다", () => {
    expect(buildSearchText(REF, payload)).toBe(buildSearchText(REF, payload));
  });

  it("상한에서 자른다 — 소스가 많아도 컬럼이 무한정 자라지 않는다", () => {
    const surfaceSlugs = Array.from({ length: 500 }, (_, index) => `surface-${index}`);
    const text = buildSearchText(REF, { kind: "PUBLISH", surfaceSlugs, refusal: null });
    expect(text.length).toBeLessThanOrEqual(SEARCH_TEXT_MAX);
    expect(text).toContain(REF);
  });
});
