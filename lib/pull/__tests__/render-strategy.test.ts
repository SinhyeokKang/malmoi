import { describe, expect, it, vi } from "vitest";
import type { Adapter, DetectedFormat, WriteInput } from "@/lib/adapters";

/**
 * **multi-locale 갈래도 원본 필수 여부를 `writeStrategy`로 판정한다** (audit #55 — CLAUDE.md "원본 내용이 필요한가는
 * `writeStrategy`로 판단한다, `layout`이 아니다"). 지금 multi-locale 어댑터는 `ts-dict`(surgical) 하나라 잠복이다 —
 * 재생성 multi-locale 어댑터가 생기면 원본이 없는 파일(새 네임스페이스)이 `original-file-missing`으로 조용히 빠진다.
 * 등록된 어댑터로는 그 조합을 못 만들어 `adapterFor`를 가짜로 바꾼다.
 */
const fake = vi.hoisted(() => ({ strategy: "regenerate" as "regenerate" | "surgical" }));
vi.mock("@/lib/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adapters")>();
  const adapter: Adapter = {
    name: "ts-dict",
    layout: "multi-locale",
    get writeStrategy() { return fake.strategy; },
    detect: () => undefined,
    detectCandidates: () => [],
    read: () => ({ locales: [], errors: [], nested: false }),
    // 원본이 있으면 이어 쓰고, 없으면 새로 만든다 — 재생성의 계약이다.
    write: (format: DetectedFormat, input: WriteInput) =>
      `${format.currentFiles?.[0]?.content ?? ""}${input.locale}:${input.entries.map((e) => e.message).join(",")};`,
  };
  return { ...actual, adapterFor: () => adapter };
});

const { renderLocaleFiles } = await import("../render");

const FORMAT: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/**/*.ts", locales: ["en", "ko"] };
const KEYS = [{ key: "hi", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, ko: { value: "안녕" } } }];

describe("renderLocaleFiles — multi-locale 원본 부재", () => {
  it("재생성이면 원본 없이도 파일을 낸다", () => {
    fake.strategy = "regenerate";
    const [file] = renderLocaleFiles(FORMAT, "multi-locale", [{ path: "src/new.ts" }], KEYS, "en", new Map());
    expect(file).toEqual({ path: "src/new.ts", content: "en:Hi;ko:안녕;" });
  });

  it("수술적이면 원본 없이 파일을 안 내고 알린다 (짝)", () => {
    fake.strategy = "surgical";
    const [file] = renderLocaleFiles(FORMAT, "multi-locale", [{ path: "src/new.ts" }], KEYS, "en", new Map());
    expect(file).toEqual({ path: "src/new.ts", content: null, errors: [{ path: "src/new.ts", code: "original-file-missing" }] });
  });
});
