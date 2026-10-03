import { describe, expect, it } from "vitest";

import { switcherProjects } from "../switcher";

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
