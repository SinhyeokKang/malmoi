import { describe, expect, it } from "vitest";

import { menuProjects, switcherProjects } from "../switcher";

const p = (slug: string, name: string, archived = false) => ({ slug, name, archived });
const rows = [p("bot", "course-chatbot"), p("malmoi", "malmoi"), p("old", "Old Site", true), p("web", "Bugshot Web")];

/**
 * **LNB 프로젝트 스위처의 목록** (2026-09-27 사용자). 보관도 싣고, `/projects` 기본 순서처럼 **보관이 맨 뒤**다.
 * 이름 대조는 검색·`/projects`와 같은 토큰 AND다(`matchesAllTokens` — 교차 표는 `lib/search/__tests__/name-match.test.ts`).
 */
describe("switcherProjects", () => {
  it("전부 싣되 보관은 맨 뒤, 나머지는 멤버십 순서 그대로", () => {
    expect(switcherProjects(rows, "").map((r) => r.slug)).toEqual(["bot", "malmoi", "web", "old"]);
  });

  it("보관이 여럿이어도 그 안의 순서가 유지된다", () => {
    const many = [p("a", "a", true), p("b", "b"), p("c", "c", true), p("d", "d")];
    expect(switcherProjects(many, "").map((r) => r.slug)).toEqual(["b", "d", "a", "c"]);
  });

  it("대소문자를 가리지 않고 앞뒤 공백을 무시한 부분 일치다 — 보관도 찾힌다", () => {
    expect(switcherProjects(rows, "  BUG ").map((r) => r.slug)).toEqual(["web"]);
    expect(switcherProjects(rows, "site").map((r) => r.slug)).toEqual(["old"]);
    expect(switcherProjects(rows, "zzz")).toEqual([]);
  });

  it("여러 낱말은 어순과 무관하게 각각 이름 안에 있으면 찾는다", () => {
    expect(switcherProjects(rows, "web bugshot").map((r) => r.slug)).toEqual(["web"]);
    expect(switcherProjects(rows, "web site")).toEqual([]);
  });

  it("원본을 건드리지 않는다", () => {
    const copy = [...rows];
    switcherProjects(rows, "");
    expect(rows).toEqual(copy);
  });
});

/**
 * **사용자 메뉴의 프로젝트 그룹** (2026-10-09 사용자, user-menu-projects D1) — 스위처의 빈 질의 순서에서 보관을 빼고 앞 5개.
 * 정렬을 새로 만들지 않는다 — 스위처 순서가 바뀌면 메뉴도 따라간다. 상한 5는 export하지 않으므로 리터럴로 단언한다.
 */
describe("menuProjects", () => {
  const n = (count: number) => Array.from({ length: count }, (_, i) => p(`p${i}`, `Project ${i}`));

  it("보관을 뺀다", () => {
    expect(menuProjects(rows).map((r) => r.slug)).toEqual(["bot", "malmoi", "web"]);
  });

  it("정확히 5개면 5개 그대로", () => {
    expect(menuProjects(n(5)).map((r) => r.slug)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("6개면 앞 5개", () => {
    expect(menuProjects(n(6)).map((r) => r.slug)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("스위처 빈 질의 순서를 그대로 따른다 — 보관이 앞에 섞여 있어도 상한은 보관 아닌 것만 센다", () => {
    const mixed = [p("a", "a", true), p("b", "b"), p("c", "c", true), p("d", "d"), p("e", "e"), p("f", "f"), p("g", "g"), p("h", "h")];
    const expected = switcherProjects(mixed, "").filter((r) => !r.archived).slice(0, 5).map((r) => r.slug);
    expect(menuProjects(mixed).map((r) => r.slug)).toEqual(expected);
    expect(expected).toEqual(["b", "d", "e", "f", "g"]);
  });

  it("0개면 빈 배열", () => {
    expect(menuProjects([])).toEqual([]);
  });

  it("보관만 있으면 빈 배열", () => {
    expect(menuProjects([p("a", "a", true), p("b", "b", true)])).toEqual([]);
  });

  it("행의 나머지 필드를 그대로 싣는다 — 썸네일 image가 따라온다", () => {
    const withImage = [{ ...p("a", "a"), image: "https://x/a.webp" }];
    expect(menuProjects(withImage)[0]?.image).toBe("https://x/a.webp");
  });
});
