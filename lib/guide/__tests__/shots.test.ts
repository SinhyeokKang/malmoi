import { describe, expect, it } from "vitest";

import { parseShotSize, shotSizes } from "../shots";

describe("parseShotSize — SHOOTING `치수` 셀", () => {
  it("`WxH`를 읽는다", () => {
    expect(parseShotSize("1672x1044")).toEqual({ width: 1672, height: 1044 });
    expect(parseShotSize(" 10x20 ")).toEqual({ width: 10, height: 20 });
  });

  it.each(["", "1672", "1672 x 1044", "0x10", "10x0", "-1x10", "1.5x10", "10X10", "x10"])("%j는 null — 렌더러가 치수 없이 그린다", (cell) => {
    expect(parseShotSize(cell)).toBeNull();
  });
});

describe("shotSizes — 에셋 → 치수", () => {
  it("에셋 경로로 찾는다 · 치수가 틀린 행은 건너뛴다", () => {
    const sizes = shotSizes([
      { asset: "/guide/a.webp", size: "100x50" },
      { asset: "/guide/b.webp", size: "unknown" },
    ]);
    expect(sizes["/guide/a.webp"]).toEqual({ width: 100, height: 50 });
    expect(Object.hasOwn(sizes, "/guide/b.webp")).toBe(false);
  });

  it("프로토타입을 끊는다 — 원고가 정한 경로가 `Object.prototype`에서 찾아지지 않는다", () => {
    const sizes = shotSizes([{ asset: "__proto__", size: "1x1" }]);
    expect(Object.hasOwn(sizes, "__proto__")).toBe(true);
    expect(Object.hasOwn(shotSizes([]), "toString")).toBe(false);
  });
});
