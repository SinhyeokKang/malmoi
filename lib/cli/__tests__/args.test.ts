import { describe, expect, it } from "vitest";
import { findTarget, flagValue, flagValues, hasFlag } from "../args";

/**
 * 세 CLI(`ingest`·`scan`·`push-local`)가 각자 짰던 인자 파싱. `ingest`만 값 플래그의 값 자리를
 * 건너뛰지 않아 `pnpm ingest --adapter ts-dict ./repo`가 `ts-dict`를 디렉터리로 읽었다
 * (scan·push-local에서 고친 결함이 ingest에 남아 있었다 — 2026-09-04 audit #10).
 */
const VALUE_FLAGS = new Set(["--adapter", "--base", "--wrapper", "--url", "--project"]);

describe("findTarget — 값 플래그의 값 자리를 건너뛴다", () => {
  it("플래그 뒤의 값을 대상으로 읽지 않는다", () => {
    expect(findTarget(["--adapter", "ts-dict", "./repo"], VALUE_FLAGS)).toBe("./repo");
    expect(findTarget(["--base", "ko", "--json", "./repo"], VALUE_FLAGS)).toBe("./repo");
    expect(findTarget(["--wrapper", "@/i18n#t", "./dir"], VALUE_FLAGS)).toBe("./dir");
  });

  it("대상이 앞에 와도 같다", () => {
    expect(findTarget(["./repo", "--adapter", "ts-dict"], VALUE_FLAGS)).toBe("./repo");
  });

  it("대상이 없으면 undefined", () => {
    expect(findTarget(["--json"], VALUE_FLAGS)).toBeUndefined();
    expect(findTarget(["--adapter", "ts-dict"], VALUE_FLAGS)).toBeUndefined();
  });
});

describe("flagValue / flagValues / hasFlag", () => {
  it("값 하나를 읽는다 — 없으면 undefined, 플래그가 마지막이면 undefined", () => {
    expect(flagValue(["--base", "ko"], "--base")).toBe("ko");
    expect(flagValue(["./repo"], "--base")).toBeUndefined();
    expect(flagValue(["./repo", "--base"], "--base")).toBeUndefined();
  });

  it("반복 플래그는 전부 모은다 — 한 리포가 클라이언트·서버 래퍼를 함께 쓴다", () => {
    expect(flagValues(["--wrapper", "a#t", "x", "--wrapper", "b#u()"], "--wrapper")).toEqual(["a#t", "b#u()"]);
    expect(flagValues([], "--wrapper")).toEqual([]);
  });

  it("불리언 플래그", () => {
    expect(hasFlag(["--json"], "--json")).toBe(true);
    expect(hasFlag(["--base", "--json"], "--json")).toBe(true);
    expect(hasFlag([], "--json")).toBe(false);
  });
});

describe("sourceKind — 스캔 경로 분류", () => {
  it("코드 파일은 ts, HTML·JSON은 raw, 나머지는 undefined", async () => {
    const { sourceKind } = await import("../walk");
    expect(sourceKind("a/b.tsx")).toBe("ts");
    expect(sourceKind("a/b.mjs")).toBe("ts");
    expect(sourceKind("manifest.json")).toBe("raw");
    expect(sourceKind("index.html")).toBe("raw");
    expect(sourceKind("README.md")).toBeUndefined();
  });
});
