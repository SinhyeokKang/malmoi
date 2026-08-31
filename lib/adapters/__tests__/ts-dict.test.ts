import { describe, expect, it } from "vitest";
import { detectFormat, tsDict } from "../index";

/**
 * 픽스처는 bugshot-2 `src/i18n/namespaces/common.ts`의 실제 형태다 —
 * `const ko/en/fr` + `as const`/`satisfies Bundle` + `export const <ns> = { ko, en, fr }`,
 * 그리고 **의미 단위 빈 줄과 주석**. 그 보존이 이 어댑터의 존재 이유다.
 */
const SOURCE = `import type { Bundle } from "./types";

const ko = {
  "common.ok": "확인",
  "common.close": "닫기",

  // 시간 표현 — 상대 시간만 쓴다
  "time.justNow": "방금",
  "time.minutesAgo": "{n}분 전",
} as const;

type Bundle2 = Record<keyof typeof ko, string>;

const en = {
  "common.ok": "OK",
  "common.close": "Close",

  // 시간 표현 — 상대 시간만 쓴다
  "time.justNow": "Just now",
  "time.minutesAgo": "{n}m ago",
} satisfies Bundle;

const fr = {
  "common.ok": "OK",
  "common.close": "Fermer",

  // 시간 표현 — 상대 시간만 쓴다
  "time.justNow": "À l'instant",
  "time.minutesAgo": "il y a {n} min",
} satisfies Bundle;

export const common = { ko, en, fr };
`;

const format = {
  adapter: "ts-dict" as const,
  pathTemplate: "src/i18n/namespaces/*.ts",
  locales: ["ko", "en", "fr"],
};
const file = (content = SOURCE) => [{ path: "src/i18n/namespaces/common.ts", content }];

describe("detectFormat — ts-dict", () => {
  it("namespaces 디렉터리의 .ts 파일들을 찾는다", () => {
    const d = detectFormat([
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/editor.ts",
      "src/i18n/index.ts",
      "package.json",
    ], () => SOURCE);
    expect(d).toMatchObject({ adapter: "ts-dict" });
    expect(d?.locales.sort()).toEqual(["en", "fr", "ko"]);
  });

  it("chrome _locales가 있으면 그쪽을 우선한다 (배포 산출물이다)", () => {
    const d = detectFormat([
      "public/_locales/en/messages.json",
      "public/_locales/ko/messages.json",
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/editor.ts",
    ], () => '{"K":{"message":"v"}}');
    expect(d?.adapter).toBe("chrome-locales");
  });

  it("로케일 선언이 없는 .ts 묶음은 잡지 않는다", () => {
    expect(detectFormat(["src/lib/a.ts", "src/lib/b.ts"], () => "export const x = 1;")).toBeUndefined();
  });
});

describe("ts-dict — read", () => {
  it("로케일별로 flat 점 표기 키를 뽑는다", () => {
    const r = tsDict.read(format, file());
    expect(r.errors).toEqual([]);
    expect(r.nested).toBe(false);
    expect(r.locales.map((l) => l.locale)).toEqual(["en", "fr", "ko"]);
    expect(r.locales.find((l) => l.locale === "ko")?.entries).toEqual([
      { key: "common.close", message: "닫기" },
      { key: "common.ok", message: "확인" },
      { key: "time.justNow", message: "방금" },
      { key: "time.minutesAgo", message: "{n}분 전" },
    ]);
  });

  it("로케일마다 값이 다르게 읽힌다", () => {
    const r = tsDict.read(format, file());
    const get = (loc: string, key: string) =>
      r.locales.find((l) => l.locale === loc)?.entries.find((e) => e.key === key)?.message;
    expect(get("ko", "common.close")).toBe("닫기");
    expect(get("en", "common.close")).toBe("Close");
    expect(get("fr", "common.close")).toBe("Fermer");
  });

  it("description은 없다 — TS 딕셔너리에 담을 곳이 없다", () => {
    const r = tsDict.read(format, file());
    for (const l of r.locales) for (const e of l.entries) expect(e).not.toHaveProperty("description");
  });

  it("문자열이 아닌 값은 에러다", () => {
    const bad = SOURCE.replace('"common.ok": "확인"', '"common.ok": someVar');
    expect(tsDict.read(format, file(bad)).errors.length).toBeGreaterThan(0);
  });

  it("여러 파일의 키가 합쳐진다", () => {
    const second = SOURCE.replace(/common\./g, "editor.").replace("export const common", "export const editor");
    const r = tsDict.read(format, [
      ...file(),
      { path: "src/i18n/namespaces/editor.ts", content: second },
    ]);
    const ko = r.locales.find((l) => l.locale === "ko")?.entries.map((e) => e.key) ?? [];
    expect(ko).toContain("common.ok");
    expect(ko).toContain("editor.ok");
  });
});

describe("ts-dict — write는 원본을 보존한다 (이 어댑터의 존재 이유)", () => {
  const write = (entries: Array<{ key: string; message: string }>, locale = "ko") =>
    tsDict.write({ ...format, currentFiles: file() }, { locale, isBase: false, entries });

  it("값이 하나도 안 바뀌면 원본과 바이트 동일하다", () => {
    const r = tsDict.read(format, file());
    const ko = r.locales.find((l) => l.locale === "ko")?.entries ?? [];
    expect(write([...ko])).toBe(SOURCE);
  });

  it("**주석을 보존한다**", () => {
    const out = write([{ key: "common.ok", message: "바뀐값" }]) ?? "";
    expect(out).toContain("// 시간 표현 — 상대 시간만 쓴다");
    expect((out.match(/\/\/ 시간 표현/g) ?? []).length).toBe(3);
  });

  it("**의미 단위 빈 줄을 보존한다**", () => {
    const out = write([{ key: "common.ok", message: "바뀐값" }]) ?? "";
    expect(out).toContain('"common.close": "닫기",\n\n  //');
  });

  it("**`as const`·`satisfies Bundle`·import·export를 보존한다**", () => {
    const out = write([{ key: "common.ok", message: "바뀐값" }]) ?? "";
    expect(out).toContain('import type { Bundle } from "./types";');
    expect(out).toContain("} as const;");
    expect((out.match(/} satisfies Bundle;/g) ?? []).length).toBe(2);
    expect(out).toContain("export const common = { ko, en, fr };");
  });

  it("**키 순서를 재배치하지 않는다** — 정렬하지 않는다", () => {
    const out = write([{ key: "common.ok", message: "바뀐값" }]) ?? "";
    const koBlock = out.slice(out.indexOf("const ko = {"), out.indexOf("} as const;"));
    const order = [...koBlock.matchAll(/"([\w.]+)":/g)].map((m) => m[1]);
    expect(order).toEqual(["common.ok", "common.close", "time.justNow", "time.minutesAgo"]);
  });

  it("지정한 로케일만 바꾼다 — 다른 로케일 값은 건드리지 않는다", () => {
    const out = write([{ key: "common.ok", message: "바뀐값" }], "ko") ?? "";
    expect(out).toContain('"common.ok": "바뀐값"');
    expect(out).toContain('"common.ok": "OK"'); // en·fr은 그대로
  });

  it("바뀐 줄만 diff에 뜬다 (원본과 한 줄만 다르다)", () => {
    const r = tsDict.read(format, file());
    const ko = (r.locales.find((l) => l.locale === "ko")?.entries ?? []).map((e) =>
      e.key === "common.ok" ? { ...e, message: "바뀐값" } : e,
    );
    const out = write(ko) ?? "";
    const a = SOURCE.split("\n");
    const b = out.split("\n");
    expect(b.length).toBe(a.length);
    expect(a.filter((line, i) => line !== b[i])).toEqual(['  "common.ok": "확인",']);
  });

  it("이스케이프가 필요한 값을 안전하게 넣는다", () => {
    const out = write([{ key: "common.ok", message: 'a"b\\c\nd' }]) ?? "";
    // 재파싱해서 값이 온전한지 확인한다 — 문자열 조립이 깨지면 여기서 잡힌다.
    const back = tsDict.read(format, [{ path: "src/i18n/namespaces/common.ts", content: out }]);
    expect(back.errors).toEqual([]);
    expect(back.locales.find((l) => l.locale === "ko")?.entries.find((e) => e.key === "common.ok")?.message)
      .toBe('a"b\\c\nd');
  });

  it("원본이 없으면 null — 수술적 치환은 원본을 필요로 한다", () => {
    expect(tsDict.write(format, { locale: "ko", isBase: false, entries: [{ key: "common.ok", message: "v" }] })).toBeNull();
  });

  it("orphaned 키는 값을 바꾸지 않는다 (파일에 남긴다)", () => {
    const out = write([{ key: "common.ok", message: "바뀐값", orphaned: true }]) ?? "";
    expect(out).toBe(SOURCE);
  });
});
