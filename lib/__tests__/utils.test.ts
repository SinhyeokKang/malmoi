import { describe, expect, it } from "vitest";
import { cn } from "../utils";

/**
 * `text-mono`를 font-size 그룹에 등록하지 않으면 twMerge가 text-color로 오분류해 조용히 지운다
 * (docs/DESIGN.md §4.2 — bugshot-2가 액션 로그 값 칩에서 밟은 함정). 순수 함수라 여기서 고정한다.
 */
describe("cn — text-mono 등록", () => {
  it("text-mono와 text-foreground가 공존한다 — 색과 크기는 다른 그룹이다", () => {
    expect(cn("text-mono", "text-foreground").split(" ").sort()).toEqual(["text-foreground", "text-mono"]);
  });

  it("text-xs 뒤의 text-mono가 text-xs를 대체한다 — 같은 font-size 그룹이다", () => {
    expect(cn("text-xs", "text-mono")).toBe("text-mono");
  });

  it("조건부 false는 버린다 (clsx 위임)", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

/** `text-prose`(16px, `/privacy` 본문 — DESIGN §6.616)도 같은 함정이다 — 커스텀 `text-*` 크기는 전부 등록한다. */
describe("cn — text-prose 등록", () => {
  it("text-prose와 text-foreground가 공존한다", () => {
    expect(cn("text-prose", "text-foreground").split(" ").sort()).toEqual(["text-foreground", "text-prose"]);
  });

  it("text-sm 뒤의 text-prose가 text-sm을 대체한다", () => {
    expect(cn("text-sm", "text-prose")).toBe("text-prose");
  });
});
