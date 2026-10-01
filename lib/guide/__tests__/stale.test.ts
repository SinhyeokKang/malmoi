import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { dictDigest, shotDictKeys, shotSources, staleShots, type ShotRecord } from "../stale";

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

  it("사전 키 소스(dict:)는 파일 경로로 주지 않는다 — 해시할 파일이 아니다", () => {
    expect(shotSources([row({ 에셋: "/guide/x.webp", 소스: "app/page.tsx, dict:home.cards.held", blob: "a, b", 치수: "" })])).toEqual(["app/page.tsx"]);
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

const sha1 = (text: string): string => createHash("sha1").update(text).digest("hex");

describe("shotDictKeys", () => {
  it("모든 행의 dict: 소스를 접두 없이 한 번씩만 준다 — 파일 경로는 주지 않는다", () => {
    const a = row({ 에셋: "/guide/a.webp", 소스: "app/a.tsx, dict:home.cards.held", blob: "1, 2", 치수: "" });
    const b = row({ 에셋: "/guide/b.webp", 소스: "dict:home.cards.held, dict:logs.status.deferred", blob: "2, 3", 치수: "" });
    expect(shotDictKeys([a, b])).toEqual(["home.cards.held", "logs.status.deferred"]);
  });

  it.each(["dict:", "dict:a..b", "dict:.a", "dict:a b"])("형식이 아닌 키 %s는 주지 않는다", (source) => {
    expect(shotDictKeys([row({ 에셋: "/guide/x.webp", 소스: source, blob: "1", 치수: "" })])).toEqual([]);
  });
});

describe("dictDigest", () => {
  const dict = {
    home: { held: "repository updates held", count: (n: number) => `${n}` },
    filters: { state: { any: "Any state", unsent: "Unsent" }, mixed: { a: "A", f: () => "x" } },
  };

  it("문자열 잎은 그 문자열의 SHA-1이다 — 표에 적는 기준값이 곧 화면 낱말의 해시다", () => {
    expect(dictDigest(dict, "home.held")).toBe(sha1("repository updates held"));
  });

  it("낱말이 바뀌면 기준값이 바뀐다", () => {
    expect(dictDigest({ filters: { state: { unsent: "Not sent" } } }, "filters.state.unsent")).not.toBe(dictDigest(dict, "filters.state.unsent"));
  });

  it("서브트리는 null이다 — 잎 키만 받아 키 순서 변경·aria 전용 형제가 기준값을 흔들지 않는다", () => {
    expect(dictDigest(dict, "filters.state")).toBeNull();
  });

  it.each(["home.missing", "home.count", "filters.mixed", "home.held.length", "constructor", "home.toString", "__proto__"])("없는 키·함수·문자열 밖 값 %s는 null이다", (path) => {
    expect(dictDigest(dict, path)).toBeNull();
  });
});

describe("staleShots — dict: 소스", () => {
  const shot = row({ 에셋: "/guide/state-filter.webp", 소스: "app/a.tsx, dict:filters.state", blob: `aaa, ${sha1("x")}`, 치수: "" });

  it("현재 기준값이 기록과 같으면 신선하다", () => {
    expect(staleShots([shot], new Map([["app/a.tsx", "aaa"], ["dict:filters.state", sha1("x")]]))).toEqual([]);
  });

  it("낱말만 바뀐 컷이 changed로 뜬다 — 파일 SHA가 같아도", () => {
    expect(staleShots([shot], new Map([["app/a.tsx", "aaa"], ["dict:filters.state", sha1("y")]]))).toEqual([
      { asset: "/guide/state-filter.webp", reason: "changed", source: "dict:filters.state" },
    ]);
  });

  it("키가 사라졌으면(현재 기준값 없음) deleted다", () => {
    expect(staleShots([shot], new Map([["app/a.tsx", "aaa"]]))).toEqual([
      { asset: "/guide/state-filter.webp", reason: "deleted", source: "dict:filters.state" },
    ]);
  });

  it("형식이 아닌 키는 invalid다", () => {
    const bad = row({ 에셋: "/guide/x.webp", 소스: "dict:a..b", blob: "1", 치수: "" });
    expect(staleShots([bad], new Map([["dict:a..b", "1"]]))).toEqual([{ asset: "/guide/x.webp", reason: "invalid", source: "dict:a..b" }]);
  });
});
