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

/**
 * ⚠️ **2026-09-14부터 자동 탐지에도 참여한다** (§1.9 판정 ③ 뒤집기). 여기서 `tsDict.detectCandidates`를
 * 직접 부르는 것은 이제 "보관된 로직이라서"가 아니라 **다른 어댑터의 순위와 섞이지 않게** 이 어댑터의
 * 판정만 재기 위해서다 — 어댑터 간 순위는 `detect-candidates.test.ts`가 본다.
 */
describe("detect — ts-dict (이 어댑터의 판정만 잰다)", () => {
  it("namespaces 디렉터리의 .ts 파일들을 찾는다", () => {
    const d = tsDict.detectCandidates([
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/editor.ts",
      "src/i18n/index.ts",
      "package.json",
    ], () => SOURCE)[0];
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

describe("회귀 — export된 선언을 로케일로 착각하지 않는다", () => {
  // bugshot-2의 `export const ai = { ko, en, fr }`·`export const app = ...`이 2~3자 소문자라
  // looksLikeLocale을 통과해 0키 "로케일"로 잡혔다. 묶음 객체는 항상 export되고
  // 로케일 객체는 파일 내부용이라 그 한 줄로 갈린다.
  it("export된 묶음 객체는 로케일이 아니다", () => {
    const src = `const ko = { "a.b": "확인" } as const;
const en = { "a.b": "OK" } satisfies Bundle;
export const ai = { ko, en };
export const app = { ko, en };
`;
    const r = tsDict.read(format, [{ path: "src/i18n/namespaces/ai.ts", content: src }]);
    expect(r.locales.map((l) => l.locale).sort()).toEqual(["en", "ko"]);
  });

  it("실제 bugshot-2 형태에서 로케일이 정확히 셋이다", () => {
    const d = tsDict.detectCandidates(
      ["src/i18n/namespaces/common.ts", "src/i18n/namespaces/ai.ts"],
      () => SOURCE + "\nexport const ai = { ko, en, fr };\n",
    )[0];
    expect(d?.locales.sort()).toEqual(["en", "fr", "ko"]);
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

  it("구문이 깨진 파일은 에러다 — TS 파서는 던지지 않고 복구해서 진단을 안 보면 부분 적재가 `errors: 0`으로 통과한다", () => {
    // `code-dict.read`는 이미 그렇게 한다(같은 이유를 주석으로 든다). 이 어댑터만 빠져 있었다
    // (2026-09-04 audit #9). 깨진 namespace 파일이면 나머지 키가 orphaned로 떨어졌다.
    const broken = SOURCE.replace('"common.close": "닫기",', '"common.close": "닫기');
    const r = tsDict.read(format, file(broken));
    expect(r.errors.some((e) => e.code === "parse-failed")).toBe(true);
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
  const write = (entries: Array<{ key: string; message: string; orphaned?: boolean }>, locale = "ko") =>
    tsDict.write({ ...format, currentFiles: file() }, { locale, entries });

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
    expect(tsDict.write(format, { locale: "ko", entries: [{ key: "common.ok", message: "v" }] })).toBeNull();
  });

  it("orphaned 키는 값을 바꾸지 않는다 (파일에 남긴다)", () => {
    const out = write([{ key: "common.ok", message: "바뀐값", orphaned: true }]) ?? "";
    expect(out).toBe(SOURCE);
  });
});

/**
 * 인용 부호 보존 — `code-dict`와 같은 결함이다 (`ts-dict.ts:196`도 `JSON.stringify`를 쓴다).
 *
 * 위 `SOURCE` 픽스처가 큰따옴표라 이 어댑터에선 드러날 수가 없었다. bugshot-2 실측도 큰따옴표
 * 리포였다 — **관측되지 않은 것이지 없던 것이 아니다.**
 */
const SOURCE_SINGLE = `const ko = {
  'common.ok': '확인',
  'common.close': '닫기',

  // 시간 표현
  'time.justNow': '방금',
} as const;

const en = {
  'common.ok': 'OK',
  'common.close': 'Close',

  // 시간 표현
  'time.justNow': 'Just now',
} as const;

export const common = { ko, en };
`;

/**
 * **CRLF 원본** (launch-readiness L4.5 — 픽스처가 전부 LF였다). 수술적 치환이라 원본 바이트가 요지다.
 */
describe("ts-dict — CRLF 원본", () => {
  const crlf = SOURCE_SINGLE.replaceAll("\n", "\r\n");
  const write = (message: string) =>
    tsDict.write({ ...format, locales: ["ko", "en"], currentFiles: [{ path: "src/i18n/namespaces/common.ts", content: crlf }] }, { locale: "ko", entries: [{ key: "common.ok", message }] }) ?? "";

  it("값 무변경 write는 바이트 동일하다", () => {
    expect(write("확인")).toBe(crlf);
  });

  it("값을 바꿔도 그 줄만 바뀌고 CRLF가 남는다", () => {
    expect(write("확인했습니다")).toBe(crlf.replace("'common.ok': '확인'", "'common.ok': '확인했습니다'"));
  });
});

describe("ts-dict — 원본의 인용 부호를 유지한다", () => {
  const fileSingle = () => [{ path: "src/i18n/namespaces/common.ts", content: SOURCE_SINGLE }];
  const writeSingle = (entries: Array<{ key: string; message: string }>, locale = "ko") =>
    tsDict.write({ ...format, locales: ["ko", "en"], currentFiles: fileSingle() }, { locale, entries });

  it("작은따옴표 원본에서 편집한 값도 작은따옴표다", () => {
    const out = writeSingle([{ key: "common.ok", message: "확인했습니다" }]) ?? "";
    expect(out).toContain("'common.ok': '확인했습니다'");
    expect(out).not.toContain('"확인했습니다"');
  });

  it("편집하지 않은 줄과 다른 로케일 블록은 그대로다", () => {
    const out = writeSingle([{ key: "common.ok", message: "바뀐값" }]) ?? "";
    expect(out).toContain("'common.close': '닫기'");
    expect(out).toContain("'common.ok': 'OK'"); // en 블록은 건드리지 않는다
    expect(out).toContain("// 시간 표현");
  });

  it("큰따옴표 원본은 큰따옴표를 유지한다 — 기존 동작에 회귀가 없다", () => {
    const out = tsDict.write({ ...format, currentFiles: file() }, {
      locale: "ko",
      entries: [{ key: "common.ok", message: "확인했습니다" }],
    }) ?? "";
    expect(out).toContain('"common.ok": "확인했습니다"');
  });

  it("작은따옴표 안의 `'`를 이스케이프하고 재파싱이 같은 값을 준다", () => {
    const out = writeSingle([{ key: "common.ok", message: "À l'instant" }]) ?? "";
    expect(out).toContain("\\'");
    const back = tsDict.read({ ...format, locales: ["ko", "en"] }, [
      { path: "src/i18n/namespaces/common.ts", content: out },
    ]);
    const ko = back.locales.find((l) => l.locale === "ko")?.entries ?? [];
    expect(ko.find((e) => e.key === "common.ok")?.message).toBe("À l'instant");
  });

  it("부호 유지가 바이트 고정점을 깨지 않는다 — 2차 write가 1차와 같다", () => {
    const first = writeSingle([{ key: "common.ok", message: "확인했습니다" }]) ?? "";
    const second = tsDict.write(
      { ...format, locales: ["ko", "en"], currentFiles: [{ path: "src/i18n/namespaces/common.ts", content: first }] },
      { locale: "ko", entries: [{ key: "common.ok", message: "확인했습니다" }] },
    ) ?? "";
    expect(second).toBe(first);
  });
});

describe("ts-dict — write의 방어", () => {
  const SRC = `const ko = { "a": "하나", b: notALiteral } as const;\nconst en = { "a": "one" } as const;\n`;
  const fmt = { adapter: "ts-dict" as const, pathTemplate: "ns/*.ts", locales: ["ko", "en"], currentFiles: [{ path: "ns/x.ts", content: SRC }] };

  it("빈 값은 치환하지 않는다 — 어댑터도 스스로 거른다 (code-dict·yaml과 같은 이중 방어)", () => {
    const out = tsDict.write(fmt, { locale: "ko", entries: [{ key: "a", message: "" }] });
    expect(out).toBe(SRC);
  });

  /**
   * ⚠️ **보고는 `wanted`에 든 키만이다** (delivery-invariants D4 · 감사 #4). 전에는 쓰려는 키와 무관한 비리터럴까지 경고로
   * 내서 `{ a: "A", b: someFn }` 파일의 `a` 편집이 `writer-warnings`로 영영 나가지 않았다.
   */
  it("쓰려는 키와 무관한 비리터럴은 보고하지 않는다 — a만 편집한 write는 경고 0건", () => {
    const res = tsDict.writeWithErrors!(fmt, { locale: "ko", entries: [{ key: "a", message: "둘" }] });
    expect(res.content).toContain('"둘"');
    expect(res.errors).toEqual([]);
  });

  it("쓰려는 키가 비리터럴이면 그 키의 경고는 그대로 난다 (짝)", () => {
    const res = tsDict.writeWithErrors!(fmt, { locale: "ko", entries: [{ key: "a", message: "둘" }, { key: "b", message: "셋" }] });
    expect(res.errors.filter((e) => e.code === "value-not-string-literal").map((e) => e.key)).toEqual(["b"]);
  });
});

/**
 * **wanted인데 로케일 객체에 자리가 없는 키** (delivery-invariants D4 · C). 삽입하지 않는다(ARCHITECTURE §1.4의 ts-dict 예외는
 * 유지) — 대신 `write-slot-missing`으로 보고해 pull이 그 셀만 보류한다. 전에는 조용해서 파일은 그대로인데 토큰이 해제됐다.
 *
 * ⚠️ **키가 이 파일 것인지는 같은 파일의 다른 로케일 객체가 말한다.** 한 표면이 네임스페이스 파일 여럿이고 렌더가 모든
 * 파일에 표면 전체 키를 넘기므로, "이 객체에 없다"만으로 보고하면 다른 파일 키 전부가 경고가 된다.
 */
describe("ts-dict — 로케일 객체에 자리가 없는 wanted 키", () => {
  const SRC = `const ko = { "a": "하나", "z": "끝" } as const;\nconst fr = { "a": "un" } as const;\n`;
  const fmt = { adapter: "ts-dict" as const, pathTemplate: "ns/*.ts", locales: ["ko", "fr"], currentFiles: [{ path: "ns/x.ts", content: SRC }] };

  it("fr 객체에 없는 z를 쓰려 하면 write-slot-missing 1건 · 내용은 그대로다", () => {
    const res = tsDict.writeWithErrors!(fmt, { locale: "fr", entries: [{ key: "a", message: "un" }, { key: "z", message: "fin" }] });
    expect(res.errors).toEqual([{ path: "ns/x.ts", code: "write-slot-missing", key: "z" }]);
    expect(res.content).toBe(SRC);
  });

  it("다른 로케일 객체에 비리터럴로만 있는 키도 이 파일 것이다 — 자리 없음으로 보고한다", () => {
    const src = `const ko = { "a": "하나", "z": someFn } as const;\nconst fr = { "a": "un" } as const;\n`;
    const res = tsDict.writeWithErrors!({ ...fmt, currentFiles: [{ path: "ns/x.ts", content: src }] }, { locale: "fr", entries: [{ key: "z", message: "fin" }] });
    expect(res.errors).toEqual([{ path: "ns/x.ts", code: "write-slot-missing", key: "z" }]);
  });

  it("이 파일의 어느 로케일 객체에도 없는 키는 다른 네임스페이스 것이다 — 보고하지 않는다", () => {
    const res = tsDict.writeWithErrors!(fmt, { locale: "fr", entries: [{ key: "a", message: "un!" }, { key: "other.ns", message: "x" }] });
    expect(res.errors).toEqual([]);
    expect(res.content).toContain('"un!"');
  });
});

describe("ts-dict — write도 구문 진단을 본다", () => {
  it("깨진 원본에는 치환하지 않고 원본 그대로 + 에러다", () => {
    const broken = SOURCE.replace('"common.close": "닫기",', '"common.close": "닫기');
    const res = tsDict.writeWithErrors!(
      { ...format, currentFiles: [{ path: "src/i18n/namespaces/common.ts", content: broken }] },
      { locale: "ko", entries: [{ key: "common.ok", message: "확인!" }] },
    );
    expect(res.content).toBe(broken);
    expect(res.errors.some((e) => e.code === "write-parse-failed")).toBe(true);
  });
});

describe("ts-dict — 로케일 객체 부재도 보고한다 (2026-09-04 audit #5)", () => {
  const SRC_KO_ONLY = 'const ko = { "a": "하나" } as const;\nexport const ns = { ko };\n';
  const fmt = {
    adapter: "ts-dict" as const,
    pathTemplate: "ns/*.ts",
    locales: ["ko", "fr"],
    currentFiles: [{ path: "ns/x.ts", content: SRC_KO_ONLY }],
  };

  it("요청한 로케일 객체가 파일에 없으면 에러다 — 로케일 전체 누락을 성공으로 처리하면 안 된다", () => {
    const res = tsDict.writeWithErrors!(fmt, {
      locale: "fr",
      entries: [{ key: "a", message: "un" }],
    });
    expect(res.content).toBe(SRC_KO_ONLY);
    expect(res.errors.some((e) => e.code === "write-locale-object-missing" && e.key === "fr")).toBe(true);
  });

  it("있는 로케일은 에러 없이 치환한다", () => {
    const res = tsDict.writeWithErrors!(fmt, {
      locale: "ko",
      entries: [{ key: "a", message: "둘" }],
    });
    expect(res.errors).toEqual([]);
    expect(res.content).toContain("둘");
  });
});
