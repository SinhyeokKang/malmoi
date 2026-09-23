import { describe, expect, it } from "vitest";
import { formatFromProject, resolveLocalePaths } from "../plan";
import { renderLocaleFiles, rowsForLocale, type RenderKey } from "../render";

/**
 * `multi-locale`이 파일 × 로케일 **이중 루프**인 것이 이 파일의 요지다.
 * `ts-dict.write`는 `currentFiles[0]`만 보고 `input.locale`로 로케일 객체 하나를 고르므로,
 * 파일 하나를 완성하려면 로케일마다 한 번씩 부르며 **결과를 다음 호출의 원본으로 넘겨야** 한다.
 * 한 축만 돌면 나머지 로케일이 조용히 원본으로 남는다.
 */

const key = (over: Partial<RenderKey> & Pick<RenderKey, "key">): RenderKey => ({
  sourceText: `src:${over.key}`,
  orphaned: false,
  cells: {},
  ...over,
});

describe("rowsForLocale — KeyRow를 로케일 하나분 PullRow로 접는다", () => {
  const keys: RenderKey[] = [
    key({ key: "a.one", cells: { ko: { value: "하나" }, en: { value: "one" } } }),
    key({ key: "a.two", cells: { en: { value: "two" } } }),
  ];

  it("그 로케일의 값만 싣는다", () => {
    expect(rowsForLocale(keys, "ko")).toEqual([
      { key: "a.one", sourceText: "src:a.one", orphaned: false, value: "하나" },
      { key: "a.two", sourceText: "src:a.two", orphaned: false, value: null },
    ]);
  });

  it("셀이 없으면 value가 null이다 — 행 부재와 빈 값을 구별해야 base 폴백이 성립한다", () => {
    expect(rowsForLocale(keys, "fr").every((r) => r.value === null)).toBe(true);
  });

  it("orphaned를 그대로 전달한다", () => {
    const rows = rowsForLocale([key({ key: "a.gone", orphaned: true })], "ko");
    expect(rows[0]).toMatchObject({ orphaned: true });
  });

  it("키 단위 description은 **base에만** 폴백한다 — 비-base에 실으면 원본에 없던 값을 만든다", () => {
    const k = [key({ key: "a.gone", orphaned: true, description: "설명" })];
    expect(rowsForLocale(k, "en", { isBase: true })[0]).toMatchObject({ description: "설명" });
    expect(rowsForLocale(k, "ko")[0]?.description).toBeUndefined();
  });

  it("빈 문자열 셀은 null이 아니라 빈 문자열로 넘긴다 — 지우기와 미번역은 다른 상태다", () => {
    const rows = rowsForLocale([key({ key: "a.one", cells: { ko: { value: "" } } })], "ko");
    expect(rows[0]?.value).toBe("");
  });
});

describe("renderLocaleFiles — per-locale", () => {
  const format = formatFromProject(
    {
      adapterName: "json-catalog",
      pathTemplate: "i18n/{locale}.json",
      nested: false,
      nestedByPath: null,
      baseLocale: "en",
    },
    ["ko", "en"],
  );
  const paths = resolveLocalePaths(format, "per-locale", []);
  const keys: RenderKey[] = [
    key({ key: "b.two", cells: { ko: { value: "둘" }, en: { value: "two" } } }),
    key({ key: "a.one", cells: { ko: { value: "하나" }, en: { value: "one" } } }),
  ];

  it("로케일당 파일 하나를 만들고 키를 정렬한다", () => {
    const files = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map());
    const ko = files.find((f) => f.path === "i18n/ko.json");
    expect(ko?.content).toBe('{\n  "a.one": "하나",\n  "b.two": "둘"\n}\n');
  });

  it("낼 항목이 0개면 content가 null이다 — 빈 파일을 내지 않는다 (ARCHITECTURE §1.1)", () => {
    const files = renderLocaleFiles(format, "per-locale", paths, [], "en", new Map());
    expect(files.every((f) => f.content === null)).toBe(true);
  });

  it("base 로케일은 번역 행이 없으면 sourceText로 폴백한다", () => {
    const only = [key({ key: "a.one", cells: { ko: { value: "하나" } } })];
    const files = renderLocaleFiles(format, "per-locale", paths, only, "en", new Map());
    expect(files.find((f) => f.path === "i18n/en.json")?.content).toContain("src:a.one");
  });

  it("base가 아닌 로케일은 폴백하지 않는다", () => {
    const only = [key({ key: "a.one", cells: { en: { value: "one" } } })];
    const files = renderLocaleFiles(format, "per-locale", paths, only, "en", new Map());
    expect(files.find((f) => f.path === "i18n/ko.json")?.content).toBeNull();
  });

  it("빈 값은 파일에 도달하지 않는다 — buildWriteEntries가 걸러야 한다", () => {
    const emptied = [key({ key: "a.one", cells: { ko: { value: "" }, en: { value: "one" } } })];
    const files = renderLocaleFiles(format, "per-locale", paths, emptied, "en", new Map());
    expect(files.find((f) => f.path === "i18n/ko.json")?.content).toBeNull();
  });

  it("orphaned 키는 파일에서 빠진다 (재생성 어댑터)", () => {
    const withGone = [
      key({ key: "a.one", cells: { ko: { value: "하나" }, en: { value: "one" } } }),
      key({ key: "z.gone", orphaned: true, cells: { ko: { value: "고아" } } }),
    ];
    const files = renderLocaleFiles(format, "per-locale", paths, withGone, "en", new Map());
    // 파일을 못 찾으면 "없다"가 공허하게 참이다 — 존재를 먼저 센다 (POSTMORTEM 2026-09-14, launch-readiness L4.4).
    const ko = files.find((f) => f.path === "i18n/ko.json");
    expect(ko?.content).toContain("하나");
    expect(ko!.content).not.toContain("z.gone");
  });

  it("같은 입력 두 번 → 바이트 동일 (결정성)", () => {
    const a = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map());
    const b = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map());
    expect(a).toEqual(b);
  });
});

describe("renderLocaleFiles — per-locale 수술적 어댑터가 원본 없이 파일을 안 낼 때", () => {
  const format = formatFromProject(
    { adapterName: "code-dict", pathTemplate: "i18n/{locale}.ts", nested: null, nestedByPath: null, baseLocale: "en" },
    ["en", "ko"],
  );
  const paths = resolveLocalePaths(format, "per-locale", ["i18n/en.ts"]);
  const keys: RenderKey[] = [key({ key: "a", cells: { en: { value: "one" }, ko: { value: "하나" } } })];

  it("content는 null이고 errors에 그 경로가 실린다 — 재생성과 다른 계약의 갈림이 보고된다", () => {
    const out = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map([["i18n/en.ts", "export default { a: 'x' };\n"]]));
    const ko = out.find((f) => f.path === "i18n/ko.ts");
    expect(ko?.content).toBeNull();
    expect(ko?.errors?.[0]?.path).toBe("i18n/ko.ts");
    // 원본이 있는 파일은 정상이고 에러가 없다.
    expect(out.find((f) => f.path === "i18n/en.ts")?.errors).toBeUndefined();
  });
});

describe("renderLocaleFiles — multi-locale (파일 × 로케일 이중 루프)", () => {
  const format = formatFromProject(
    {
      adapterName: "ts-dict",
      pathTemplate: "src/i18n/ns/*.ts",
      nested: null,
      nestedByPath: null,
      baseLocale: "en",
    },
    ["ko", "en", "fr"],
  );

  /** bugshot-2의 구조를 축소한 것 — 로케일 객체 3개 + 묶음 export + 사람이 넣은 빈 줄·주석. */
  const source = `const ko = {
  // 인사말
  "a.one": "하나",

  "a.two": "둘",
} as const;

const en = {
  // 인사말
  "a.one": "one",

  "a.two": "two",
} as const;

const fr = {
  // 인사말
  "a.one": "un",

  "a.two": "deux",
} as const;

export const ns = { ko, en, fr };
`;

  const tree = ["src/i18n/ns/ns.ts"];
  const paths = resolveLocalePaths(format, "multi-locale", tree);
  const current = new Map([["src/i18n/ns/ns.ts", source]]);

  it("한 파일 안에서 로케일 3개를 모두 치환한다 — 로케일 축을 안 돌면 나머지가 원본으로 남는다", () => {
    const keys: RenderKey[] = [
      key({
        key: "a.one",
        cells: { ko: { value: "하나!" }, en: { value: "one!" }, fr: { value: "un!" } },
      }),
    ];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    const content = out[0]?.content ?? "";
    expect(content).toContain('"하나!"');
    expect(content).toContain('"one!"');
    expect(content).toContain('"un!"');
  });

  it("빈 줄과 주석이 보존된다 — 재생성으로 퇴화하면 이 케이스가 깨진다", () => {
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: "하나!" } } })];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(out[0]?.content).toContain("// 인사말");
    expect(out[0]?.content).toMatch(/"하나!",\n\n/);
  });

  it("바뀐 값이 없으면 원본을 바이트 동일하게 돌려준다", () => {
    const keys: RenderKey[] = [
      key({
        key: "a.one",
        cells: { ko: { value: "하나" }, en: { value: "one" }, fr: { value: "un" } },
      }),
      key({
        key: "a.two",
        cells: { ko: { value: "둘" }, en: { value: "two" }, fr: { value: "deux" } },
      }),
    ];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(out[0]?.content).toBe(source);
  });

  it("빈 값은 치환하지 않는다 — 원본 리터럴이 남아야 한다 (ARCHITECTURE §1.1)", () => {
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: "" } } })];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(out[0]?.content).toContain('"하나"');
    expect(out[0]?.content).not.toContain('"a.one": ""');
  });

  it("orphaned 키는 값을 바꾸지 않는다 — 파일에 남는다 (ARCHITECTURE §1.4)", () => {
    const keys: RenderKey[] = [
      key({ key: "a.one", orphaned: true, cells: { ko: { value: "바뀐값" } } }),
    ];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(out[0]?.content).toContain('"하나"');
    expect(out[0]?.content).not.toContain("바뀐값");
  });

  it("원본이 없는 경로는 content가 null이다 — 치환할 대상이 없다", () => {
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: "하나!" } } })];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", new Map());
    expect(out[0]?.content).toBeNull();
  });

  it("원본이 없어 파일을 안 내는 것도 **보고한다** — 조용히 빠지면 그 로케일이 흔적 없이 PR에서 사라진다", () => {
    // ts-dict의 로케일 객체 부재는 에러로 내는데(§1.35) 파일 부재만 예외였다 (2026-09-04 audit #7).
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: "하나!" } } })];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", new Map());
    expect(out[0]?.errors?.length ?? 0).toBeGreaterThan(0);
    expect(out[0]?.errors?.[0]?.path).toBe(paths[0]?.path);
  });

  it("이스케이프가 필요한 값이 재파싱을 견딘다 (setLiteralValue 함정)", () => {
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: 'a"b\\c\nd' } } })];
    const out = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(out[0]?.content).toContain(JSON.stringify('a"b\\c\nd'));
  });

  it("같은 입력 두 번 → 바이트 동일 (결정성)", () => {
    const keys: RenderKey[] = [key({ key: "a.one", cells: { ko: { value: "하나!" } } })];
    const a = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    const b = renderLocaleFiles(format, "multi-locale", paths, keys, "en", current);
    expect(a).toEqual(b);
  });
});

describe("renderLocaleFiles — base description 폴백이 실제 경로에서 켜진다", () => {
  const format = formatFromProject(
    { adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: null, nestedByPath: null, baseLocale: "en" },
    ["en", "ko"],
  );
  const paths = resolveLocalePaths(format, "per-locale", []);

  it("base 셀에 description이 없으면 StringKey.description으로 폴백한다 — rowsForLocale에 isBase가 닿아야 한다", () => {
    // `Translation.description`이 전부 null인 마이그레이션 직후 상태. `rowsForLocale` 단위 테스트는
    // `{ isBase: true }`를 직접 넘겨 이 홉을 못 본다 — 여기서 renderLocaleFiles를 통째로 지난다.
    const keys: RenderKey[] = [
      key({ key: "hello", description: "인사말", cells: { en: { value: "Hello" }, ko: { value: "안녕" } } }),
    ];
    const files = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map());
    expect(files.find((f) => f.path === "_locales/en/messages.json")?.content).toContain('"description": "인사말"');
    // 비-base엔 폴백하지 않는다 — 원본에 없던 값을 만드는 것은 병합이다.
    const ko = files.find((f) => f.path === "_locales/ko/messages.json");
    expect(ko?.content).toEqual(expect.any(String));
    expect(ko!.content).not.toContain("인사말");
  });
});

describe("renderLocaleFiles — writer가 버린 항목을 errors로 싣는다", () => {
  it("json-catalog 접두 충돌로 버린 키가 LocalFile.errors에 남는다 — 프로덕션에서 조용히 사라지면 안 된다 (ARCHITECTURE §1.35)", () => {
    const format = formatFromProject(
      { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: true, nestedByPath: null, baseLocale: "en" },
      ["en"],
    );
    const paths = resolveLocalePaths(format, "per-locale", []);
    const keys: RenderKey[] = [
      key({ key: "a.b", cells: { en: { value: "leaf" } } }),
      key({ key: "a.b.c", cells: { en: { value: "deeper" } } }),
    ];
    const files = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map());
    const en = files.find((f) => f.path === "i18n/en.json");
    expect(en?.errors?.length ?? 0).toBeGreaterThan(0);
    expect(en?.errors?.[0]?.code).toBe("key-shadowed");
    expect(en?.errors?.[0]?.key).toBe("a.b");
  });
});

/**
 * **보류 좌표를 렌더 출력에 싣는다** (delivery-invariants D3). `content`·`path`는 그대로라 트리 페이로드·blob SHA에 영향이 없다.
 */
describe("renderLocaleFiles — 보류 좌표", () => {
  it("per-locale 출력에 locale이 붙고, 그 오류에도 locale이 붙는다", () => {
    const format = formatFromProject(
      { adapterName: "code-dict", pathTemplate: "i18n/{locale}.ts", nested: null, nestedByPath: null, baseLocale: "en" },
      ["en", "ko"],
    );
    const paths = resolveLocalePaths(format, "per-locale", ["i18n/en.ts"]);
    const out = renderLocaleFiles(format, "per-locale", paths, [key({ key: "a", cells: { en: { value: "one" }, ko: { value: "하나" } } })], "en",
      new Map([["i18n/en.ts", "export default { a: 'x' };\n"]]));
    expect(out.map((f) => f.locale)).toEqual(paths.map((p) => p.locale));
    expect(out.find((f) => f.path === "i18n/ko.ts")?.errors?.[0]).toMatchObject({ code: "original-file-missing", locale: "ko" });
  });

  it("ts-dict write-slot-missing에 그 write 호출의 locale이 붙는다", () => {
    const format = formatFromProject(
      { adapterName: "ts-dict", pathTemplate: "ns/*.ts", nested: null, nestedByPath: null, baseLocale: "ko" },
      ["ko", "fr"],
    );
    const source = `const ko = { "a": "하나", "z": "끝" } as const;\nconst fr = { "a": "un" } as const;\n`;
    const paths = resolveLocalePaths(format, "multi-locale", ["ns/x.ts"]);
    const out = renderLocaleFiles(format, "multi-locale", paths,
      [key({ key: "a", cells: { ko: { value: "하나" }, fr: { value: "un" } } }), key({ key: "z", cells: { ko: { value: "끝" }, fr: { value: "fin" } } })],
      "ko", new Map([["ns/x.ts", source]]));
    expect(out[0]?.errors).toEqual([{ path: "ns/x.ts", code: "write-slot-missing", key: "z", locale: "fr" }]);
    expect(out[0]?.locale).toBeUndefined();
  });
});
