import { describe, expect, it } from "vitest";

import { switcherProjects } from "../switcher";

const p = (slug: string, name: string, archived = false) => ({ slug, name, archived });
const rows = [p("web", "Bugshot Web"), p("malmoi", "malmoi"), p("old", "Old Site", true), p("bot", "course-chatbot")];

/**
 * **LNB 프로젝트 스위처의 목록** (2026-09-27 사용자). 보관은 뺀다 — 옮겨 갈 곳이 아니다. ⚠️ **지금 프로젝트는 보관이어도 남는다** —
 * 그래야 "지금 어디인가"의 체크가 사라지지 않는다. 이름 대조는 `/projects` 검색(`searchProjects`)과 같은 규칙이다.
 */
describe("switcherProjects", () => {
  it("보관 제외, 멤버십 순서 그대로", () => {
    expect(switcherProjects(rows, "web", "").map((r) => r.slug)).toEqual(["web", "malmoi", "bot"]);
  });

  it("지금 프로젝트는 보관이어도 남는다", () => {
    expect(switcherProjects(rows, "old", "").map((r) => r.slug)).toEqual(["web", "malmoi", "old", "bot"]);
  });

  it("대소문자를 가리지 않고 앞뒤 공백을 무시한 부분 일치다", () => {
    expect(switcherProjects(rows, null, "  BUG ").map((r) => r.slug)).toEqual(["web"]);
    expect(switcherProjects(rows, null, "o").map((r) => r.slug)).toEqual(["web", "malmoi", "bot"]);
    expect(switcherProjects(rows, null, "zzz")).toEqual([]);
  });

  it("원본을 건드리지 않는다", () => {
    const copy = [...rows];
    switcherProjects(rows, null, "bug");
    expect(rows).toEqual(copy);
  });
});
