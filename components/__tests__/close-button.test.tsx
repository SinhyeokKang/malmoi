// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { CloseButton } from "@/components/ui/close-button";

import { render } from "./helpers/dom";

/**
 * **닫기 X는 한 형이다** (DESIGN §6.4 · ux-drift-unify T13 · 5-Y9) — ghost · 36 · 원형 · hover `foreground` 3% · X 20.
 * 440 Dialog의 36 정방 · 1024 모달의 원형 · Alert의 정방 · 이력 상세의 raw Close · Sources 결과 행의 28 원이 다섯 형이었다.
 */
describe("CloseButton", () => {
  it("ghost 36 원형 · X 20 · 라벨이 접근 이름이다", async () => {
    const { container } = await render(<CloseButton label="Close" />);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Close");
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["size-9", "rounded-full", "px-0", "hover:bg-foreground/[0.03]"]));
    // md의 radius가 원형 옆에 남지 않는다 — 둘이 서면 twMerge 순서에 기댄다.
    expect(button.className).not.toContain("rounded-md");
    const x = button.querySelector("svg")!;
    expect(x.getAttribute("aria-hidden")).toBe("true");
    expect(x.getAttribute("class")).toContain("size-5");
  });

  it("className은 자리만 덧댄다 — 음수 마진·절대 위치", async () => {
    const { container } = await render(<CloseButton label="Close" className="-mt-1.5 -mr-2" />);
    expect(container.querySelector("button")!.className).toContain("-mt-1.5");
  });
});

/** 다섯 자리가 전부 이 프리미티브를 지난다 — 손으로 X를 그리는 닫기가 남지 않는다. */
describe("닫기 X — 손으로 그린 사본이 없다", () => {
  const ROOT = process.cwd();
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
      return /\.tsx$/.test(name) ? [path] : [];
    });
  const files = ["app", "components"].flatMap((d) => sources(join(ROOT, d))).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));

  it("스캔 대상이 비어 있지 않다", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * `<X`를 그리는 파일은 프리미티브와 둘뿐이다 — 초대 모달의 행 지우기(닫기가 아니라 받는 사람 한 줄을 빼는 동작)와
   * 랜딩 목업(실물 모달 머리의 정적 복제).
   */
  /** 한 줄 행 안의 닫기는 음수 마진으로 행 높이를 안 늘린다 — Alert(`-my-2 -mr-2`)와 Sources 결과 행이 같다(U3 r1). */
  it("한 줄 행 안의 CloseButton 둘이 같은 음수 마진을 든다", () => {
    for (const path of ["components/ui/alert.tsx", "components/sources/sources-screen.tsx"]) {
      const tag = files.find((f) => f.path === path)?.text.match(/<CloseButton\b[\s\S]*?className="([^"]*)"/)?.[1];
      expect(tag, path).toBe("-my-2 -mr-2");
    }
  });

  it("`<X` 글리프가 CloseButton 밖에서 서지 않는다", () => {
    const drawn = files.filter((f) => /<X\b/.test(f.text)).map((f) => f.path).sort();
    expect(drawn).toEqual(["components/landing/mockup/publish.tsx", "components/members/invite-modal.tsx", "components/ui/close-button.tsx"]);
  });
});
