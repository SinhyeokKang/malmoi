import { describe, expect, it } from "vitest";

import { shotSources, staleShots, type ShotRecord } from "../stale";

/** SHOOTING 표 한 행 — 열 `에셋` · `소스` · `blob`의 셀 문자열 그대로. */
function row(cells: { 에셋: string; 소스: string; blob: string; 치수: string }): ShotRecord {
  return { asset: cells.에셋, sources: cells.소스, blobs: cells.blob };
}

const home = row({ 에셋: "/guide/home.webp", 소스: "app/page.tsx, components/home.tsx", blob: "aaa, bbb", 치수: "1440x900" });

describe("shotSources", () => {
  it("모든 행의 소스를 쉼표로 갈라 한 번씩만 준다", () => {
    const other = row({ 에셋: "/guide/x.webp", 소스: "app/page.tsx,lib/x.ts", blob: "aaa,ccc", 치수: "10x10" });
    expect(shotSources([home, other])).toEqual(["app/page.tsx", "components/home.tsx", "lib/x.ts"]);
  });

  it.each(["/etc/passwd", "../outside.ts", "app/../../x.ts", "C:\\x.ts", "app\\x.ts"])("리포 밖·비정규 경로 %s는 주지 않는다 — 스크립트가 해시하지 않는다", (path) => {
    expect(shotSources([row({ 에셋: "/guide/x.webp", 소스: `app/page.tsx, ${path}`, blob: "a, b", 치수: "" })])).toEqual(["app/page.tsx"]);
  });

  it("빈 소스 셀은 경로를 만들지 않는다", () => {
    expect(shotSources([row({ 에셋: "/guide/x.webp", 소스: "", blob: "", 치수: "" })])).toEqual([]);
  });
});

describe("staleShots", () => {
  it("기록 SHA와 현재 SHA가 전부 같으면 빈 목록이다", () => {
    const current = new Map([
      ["app/page.tsx", "aaa"],
      ["components/home.tsx", "bbb"],
    ]);
    expect(staleShots([home], current)).toEqual([]);
  });

  it("SHA가 다른 소스를 그 에셋의 changed로 낸다 — 같은 순서의 blob과 견준다", () => {
    const current = new Map([
      ["app/page.tsx", "aaa"],
      ["components/home.tsx", "zzz"],
    ]);
    expect(staleShots([home], current)).toEqual([{ asset: "/guide/home.webp", reason: "changed", source: "components/home.tsx" }]);
  });

  it("현재 SHA가 없는 소스(삭제·이동)는 deleted다", () => {
    const current = new Map([["app/page.tsx", "aaa"]]);
    expect(staleShots([home], current)).toEqual([{ asset: "/guide/home.webp", reason: "deleted", source: "components/home.tsx" }]);
  });

  it("리포 밖 경로는 invalid다 — 작업 트리 밖을 해시하지 않고 신선하다고도 말하지 않는다", () => {
    const outside = row({ 에셋: "/guide/x.webp", 소스: "app/a.tsx, ../secret.ts", blob: "aaa, bbb", 치수: "" });
    expect(staleShots([outside], new Map([["app/a.tsx", "aaa"]]))).toEqual([{ asset: "/guide/x.webp", reason: "invalid", source: "../secret.ts" }]);
  });

  it("blob 셀이 비었으면 unrecorded 하나다 — 소스별로 쪼개지 않는다", () => {
    const unrecorded = row({ 에셋: "/guide/new.webp", 소스: "app/a.tsx, app/b.tsx", blob: "", 치수: "" });
    expect(staleShots([unrecorded], new Map([["app/a.tsx", "x"], ["app/b.tsx", "y"]]))).toEqual([
      { asset: "/guide/new.webp", reason: "unrecorded", source: null },
    ]);
  });

  it("소스 수와 blob 수가 다르면 count-mismatch 하나다 — 어느 SHA가 어느 소스인지 모르니 견주지 않는다", () => {
    const skewed = row({ 에셋: "/guide/x.webp", 소스: "app/a.tsx, app/b.tsx", blob: "aaa", 치수: "10x10" });
    expect(staleShots([skewed], new Map([["app/a.tsx", "zzz"]]))).toEqual([{ asset: "/guide/x.webp", reason: "count-mismatch", source: null }]);
  });

  it("소스 셀이 비었으면 unrecorded다 — 견줄 대상이 없는 행을 신선하다고 말하지 않는다", () => {
    const empty = row({ 에셋: "/guide/x.webp", 소스: "", blob: "", 치수: "" });
    expect(staleShots([empty], new Map())).toEqual([{ asset: "/guide/x.webp", reason: "unrecorded", source: null }]);
  });

  it("표의 행 순서를 지킨다", () => {
    const a = row({ 에셋: "/guide/a.webp", 소스: "x.ts", blob: "1", 치수: "1x1" });
    const b = row({ 에셋: "/guide/b.webp", 소스: "y.ts", blob: "2", 치수: "1x1" });
    expect(staleShots([b, a], new Map()).map((s) => s.asset)).toEqual(["/guide/b.webp", "/guide/a.webp"]);
  });
});
