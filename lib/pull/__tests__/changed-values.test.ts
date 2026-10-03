import { describe, expect, it } from "vitest";
import { adapterFor } from "@/lib/adapters";
import type { DetectedFormat, ReadLocale } from "@/lib/adapters/types";
import { countChangedValues, countFileChangedValues } from "../changed-values";

/**
 * Publish가 리포 파일에서 바꾼 값 수 (project-card-tabs design §2.3 — 정의 (b)). **관측값이다** — 이 수로 무엇을 보낼지 고르지 않는다.
 */

const loc = (locale: string, entries: Record<string, string>): ReadLocale => ({
  locale,
  entries: Object.entries(entries).map(([key, message]) => ({ key, message })),
});

describe("countChangedValues — 수정 + 추가, 삭제 제외", () => {
  it("같은 값이면 0이다", () => {
    expect(countChangedValues([loc("ko", { a: "하나" })], [loc("ko", { a: "하나" })])).toBe(0);
  });

  it("값이 바뀐 엔트리를 센다", () => {
    expect(countChangedValues([loc("ko", { a: "하나", b: "둘" })], [loc("ko", { a: "하나!", b: "둘" })])).toBe(1);
  });

  it("새 엔트리를 센다", () => {
    expect(countChangedValues([loc("ko", { a: "하나" })], [loc("ko", { a: "하나", b: "둘" })])).toBe(1);
  });

  it("사라진 엔트리는 세지 않는다 — orphaned·DB 전용 키가 빠지는 것은 사람의 편집이 아니다", () => {
    expect(countChangedValues([loc("ko", { a: "하나", b: "둘" })], [loc("ko", { a: "하나" })])).toBe(0);
  });

  it("새 로케일은 엔트리 전부가 추가다", () => {
    expect(countChangedValues([loc("ko", { a: "하나" })], [loc("ko", { a: "하나" }), loc("ja", { a: "一", b: "二" })])).toBe(2);
  });

  it("옛 원문이 없으면(새 파일) 새 엔트리 전부를 센다", () => {
    expect(countChangedValues([], [loc("ja", { a: "一" })])).toBe(1);
  });

  it("로케일을 넘어 같은 키를 섞지 않는다", () => {
    expect(countChangedValues([loc("ko", { a: "x" })], [loc("en", { a: "x" })])).toBe(1);
  });

  it("메시지만 본다 — description·placeholders만 바뀐 엔트리는 0이다(표현만 바뀐 커밋)", () => {
    const before: ReadLocale[] = [{ locale: "en", entries: [{ key: "a", message: "one", description: "old" }] }];
    const after: ReadLocale[] = [{ locale: "en", entries: [{ key: "a", message: "one", description: "new", placeholders: { x: { content: "$1" } } }] }];
    expect(countChangedValues(before, after)).toBe(0);
  });

  it("키가 프로토타입 이름이어도 센다", () => {
    expect(countChangedValues([loc("ko", { toString: "a" })], [loc("ko", { toString: "b", __proto__x: "c" })])).toBe(2);
    expect(countChangedValues([], [{ locale: "ko", entries: [{ key: "__proto__", message: "x" }] }])).toBe(1);
  });

  it("양쪽에 같은 __proto__·constructor 엔트리(로케일 이름도)가 있으면 0이다 — 평범한 {}면 setter·상속값이 끼어 수가 갈린다", () => {
    const same = (): ReadLocale[] => [
      { locale: "ko", entries: [{ key: "__proto__", message: "x" }, { key: "constructor", message: "y" }] },
      { locale: "__proto__", entries: [{ key: "a", message: "z" }] },
      { locale: "constructor", entries: [{ key: "constructor", message: "w" }] },
    ];
    expect(countChangedValues(same(), same())).toBe(0);
  });
});

describe("countFileChangedValues — 파일 하나를 어댑터로 읽어 견준다", () => {
  const json: DetectedFormat = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"] };

  it("들여쓰기·키 순서만 바뀌면 0이다", () => {
    const before = '{\n    "b": "둘",\n    "a": "하나"\n}\n';
    const after = '{\n  "a": "하나",\n  "b": "둘"\n}\n';
    expect(countFileChangedValues(adapterFor(json), json, "i18n/ko.json", before, after)).toBe(0);
  });

  it("값 하나 수정 + 하나 추가 + 하나 삭제 = 2", () => {
    const before = '{\n  "a": "하나",\n  "c": "셋"\n}\n';
    const after = '{\n  "a": "하나!",\n  "b": "둘"\n}\n';
    expect(countFileChangedValues(adapterFor(json), json, "i18n/ko.json", before, after)).toBe(2);
  });

  it("새 파일(옛 원문 없음)은 엔트리 전부다", () => {
    expect(countFileChangedValues(adapterFor(json), json, "i18n/ko.json", undefined, '{\n  "a": "하나",\n  "b": "둘"\n}\n')).toBe(2);
  });

  it("multi-locale(ts-dict) 파일은 로케일마다 센다", () => {
    const ts: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/i18n.ts", locales: ["en", "ko"] };
    const before = 'const ko = {\n  "a": "하나",\n} as const;\n\nconst en = {\n  "a": "one",\n} as const;\n\nexport default { ko, en };\n';
    const after = 'const ko = {\n  "a": "하나!",\n} as const;\n\nconst en = {\n  "a": "one!",\n} as const;\n\nexport default { ko, en };\n';
    expect(countFileChangedValues(adapterFor(ts), ts, "src/i18n.ts", before, after)).toBe(2);
  });
});
