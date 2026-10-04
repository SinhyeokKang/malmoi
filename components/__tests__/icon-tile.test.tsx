// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { IconTile } from "@/components/ui/icon-tile";

import { render } from "./helpers/dom";

/**
 * **아이콘 칸은 규격 둘이다** (2026-09-28 사용자) — `sm` 28 · 4 · 16(행 안 전부), `lg` 40 · 8 · 20(새 프로젝트 후보 행 · Logs 상세 · 빈 상태).
 */
describe("IconTile", () => {
  it("sm은 28 · radius 4 · 글리프 16이다", async () => {
    const { container } = await render(<IconTile><svg /></IconTile>);
    const tile = container.firstElementChild;
    expect(tile?.className.split(" ")).toEqual(expect.arrayContaining(["size-7", "rounded", "[&_svg]:size-4"]));
  });

  it("lg는 40 · radius 8 · 글리프 20이다", async () => {
    const { container } = await render(<IconTile size="lg"><svg /></IconTile>);
    expect(container.firstElementChild?.className.split(" ")).toEqual(expect.arrayContaining(["size-10", "rounded-sm", "[&_svg]:size-5"]));
  });

  /**
   * **상태 칸의 색은 `tone`이 든다** (DESIGN §2.4 아이콘 칸 열 · ux-drift-unify T11) — 호출부가 초록·호박·빨강 문자열을 고르지 않는다.
   * 기대값은 §2.4 표의 칸 열을 그대로 옮겼다. `muted`는 기본 회색 칸과 같다.
   */
  it.each([
    ["success", "bg-success-soft text-success-foreground"],
    ["muted", "bg-foreground/5 text-muted-foreground"],
    ["warning", "bg-warning-soft text-warning-soft-foreground"],
    ["danger", "bg-destructive/8 text-destructive"],
  ] as const)("tone %s → §2.4 칸 %s", async (tone, cell) => {
    const classes = (await render(<IconTile tone={tone}><svg /></IconTile>)).container.firstElementChild?.className.split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(cell.split(" ")));
    // 기본 회색 면이 상태 색 옆에 남지 않는다 — 두 면이 한 칸에 서면 twMerge 순서에 기댄다.
    if (tone !== "muted") expect(classes).not.toContain("bg-foreground/5");
  });

  it("tone이 없으면 muted 칸이다", async () => {
    const plain = (await render(<IconTile><svg /></IconTile>)).container.firstElementChild?.className;
    const muted = (await render(<IconTile tone="muted"><svg /></IconTile>)).container.firstElementChild?.className;
    expect(plain).toBe(muted);
  });

  it("회색 칸이 기본이고, 정보 색은 덮는다 — 기본 면이 남지 않는다", async () => {
    const plain = (await render(<IconTile><svg /></IconTile>)).container.firstElementChild?.className ?? "";
    expect(plain).toContain("bg-foreground/5");
    expect(plain).toContain("text-muted-foreground");
    const tinted = (await render(<IconTile className="bg-destructive/8 text-destructive"><svg /></IconTile>)).container.firstElementChild?.className ?? "";
    expect(tinted).toContain("bg-destructive/8");
    expect(tinted).not.toContain("bg-foreground/5");
    expect(tinted).not.toContain("text-muted-foreground");
  });
});

/**
 * ⚠️ **칸을 손으로 다시 적지 않는다** — 2026-09-28까지 `PanelRow`의 칸을 Settings·Sources·Home이 복사해 적었고, 복사본마다 글자색이
 * 갈렸다. 칸의 옛 모양(`size-7 … rounded` · `size-10 … rounded-md` · 빈 상태 원)이 소스에 0이어야 한다.
 */
describe("아이콘 칸 — 손으로 적은 사본이 없다", () => {
  const ROOT = process.cwd();
  const HOME = "components/ui/icon-tile.tsx";
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  const files = ["app", "components"].flatMap((d) => sources(join(ROOT, d))).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));
  /** 칸 = 가운데 정렬 flex + 고정 크기 + 모서리. 골격(`Skeleton`)과 아바타·썸네일·닫기 버튼은 이 모양이 아니다. */
  const TILE = /flex size-(?:7|8|9|10|12) (?:shrink-0 )?items-center justify-center (?:rounded(?:-md|-lg|-full)?)\b/;

  it("스캔 대상이 비어 있지 않다", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * 줄 단위로 센다. 같은 모양이어도 **포커스 링을 든 줄은 칸이 아니라 누르는 것**(로고 링크 · 닫기 버튼)이라 뺀다.
   * 랜딩 목업은 셸의 로고·아바타를 정적으로 복제한 자리라 뺀다(목업 안에 아이콘 칸은 없다).
   */
  it("`IconTile` 밖에 칸 모양의 클래스가 없다", () => {
    const stray = files
      .filter((f) => f.path !== HOME && !f.path.startsWith("components/landing/mockup/"))
      .flatMap((f) => f.text.split("\n").map((line, i) => ({ at: `${f.path}:${i + 1}`, line })))
      .filter(({ line }) => TILE.test(line) && !line.includes("focus-visible"))
      .map(({ at }) => at);
    expect(stray).toEqual([]);
  });
});
