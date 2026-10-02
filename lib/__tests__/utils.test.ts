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

describe("cn — T2 토큰이 기존 철자의 충돌 제거를 보존한다", () => {
  it.each([
    ["leading-[1.6]", "leading-body", "leading-normal"],
    ["leading-[1.7]", "leading-prose", "leading-normal"],
    ["leading-[1.55]", "leading-translation", "leading-normal"],
    ["leading-[1.7]", "leading-prose", "text-xs/6"],
    ["py-[13px]", "py-row-y", "py-0"],
    ["py-[13px]", "py-row-y", "p-0"],
    ["gap-[3px]", "gap-copy-gap", "gap-0"],
    ["gap-[3px]", "gap-copy-gap", "gap-x-0"],
    ["space-y-[3px]", "space-y-copy-gap", "space-y-0"],
    ["min-w-[1280px]", "min-w-shell-min", "min-w-0"],
    ["h-[calc(100svh-96px)]", "h-[calc(100svh-var(--spacing-modal-gutter))]", "h-0"],
    ["w-[calc(100%-96px)]", "w-[calc(100%-var(--spacing-modal-gutter))]", "w-0"],
    ["text-blue-600", "text-link", "text-red-700"],
    ["bg-blue-600/[0.14]", "bg-link/[0.14]", "bg-background"],
    ["text-neutral-300", "text-gray-light", "text-foreground"],
    ["text-neutral-400", "text-gray-dim", "text-foreground"],
    ["text-neutral-600", "text-gray-strong", "text-foreground"],
    ["border-neutral-300", "border-gray-light", "border-border"],
    ["@max-[640px]:w-full", "@max-form:w-full", "@max-form:w-0"],
    ["@min-[640px]:w-full", "@min-form:w-full", "@min-form:w-0"],
  ])("%s → %s override 양방향·수정자가 같다", (before, after, override) => {
    const oldOverride = override.replace("@max-form:", "@max-[640px]:").replace("@min-form:", "@min-[640px]:");
    const renamed = (value: string) => value.replaceAll(before, after).replaceAll(oldOverride, override);
    for (const prefix of ["", "hover:"]) {
      expect(cn(`${prefix}${after}`, `${prefix}${override}`)).toBe(renamed(cn(`${prefix}${before}`, `${prefix}${oldOverride}`)));
      expect(cn(`${prefix}${override}`, `${prefix}${after}`)).toBe(renamed(cn(`${prefix}${oldOverride}`, `${prefix}${before}`)));
    }
  });

  it("새 색 토큰은 글꼴 크기와 다른 그룹이다", () => {
    expect(cn("text-gray-dim", "text-xs")).toBe("text-gray-dim text-xs");
    expect(cn("text-link", "text-mono")).toBe("text-link text-mono");
  });
});
