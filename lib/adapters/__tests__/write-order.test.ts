import { describe, expect, it } from "vitest";
import { chromeLocales, jsonCatalog } from "../index";
import type { AdapterFile, DetectedFormat, LocaleEntry } from "../types";

/**
 * 재생성 writer가 **원본 순서로 재조립한다** (ARCHITECTURE §1.1).
 *
 * 가장 중요한 검사는 **왕복 바이트 동일**이다 — 원본이 우리 정렬 규칙을 따르지 **않는** 파일을
 * 읽어서 다시 쓰면 원본과 바이트가 같아야 한다. 그게 "첫 pull PR이 파일을 통째로 재정렬하지
 * 않는다"의 실제 정의다.
 *
 * ⚠️ **중첩은 층이 여럿이라 최상위만 맞으면 안 된다.** 실측 리포 중 중첩이 다수이고
 * (excalidraw·open-webui·outline·cal.com), 하위 층만 재정렬돼도 diff 비율은 낮은데 hunk가
 * 수십 개가 되어 리뷰가 불가능해진다 (`docs/ARCHITECTURE §1.9` §10, spec §왜 diff 비율
 * 하나로는 부족한가).
 */

const f = (path: string, content: string): AdapterFile => ({ path, content });

const jsonFmt = (nested: boolean): DetectedFormat => ({
  adapter: "json-catalog",
  pathTemplate: "i18n/{locale}.json",
  locales: ["en"],
  nested,
});
const chromeFmt: DetectedFormat = {
  adapter: "chrome-locales",
  pathTemplate: "_locales/{locale}/messages.json",
  locales: ["en"],
};

/** read → write 한 바퀴. 원본이 그대로 나오는지가 이 기능의 정의다. */
function roundtrip(content: string, nested: boolean): string | null {
  const fmt = jsonFmt(nested);
  const r = jsonCatalog.read(fmt, [f("i18n/en.json", content)]);
  expect(r.errors).toEqual([]);
  return jsonCatalog.write(
    { ...fmt, nested: r.nested, nestedByPath: r.nestedByPath },
    { locale: "en", entries: r.locales[0]!.entries },
  );
}

function chromeRoundtrip(content: string): string | null {
  const r = chromeLocales.read(chromeFmt, [f("_locales/en/messages.json", content)]);
  expect(r.errors).toEqual([]);
  return chromeLocales.write(chromeFmt, { locale: "en", entries: r.locales[0]!.entries });
}

describe("json-catalog.write — 원본 순서로 재조립한다", () => {
  it("flat: 정렬 안 된 원본이 바이트 그대로 돌아온다", () => {
    const src = '{\n  "b": "B",\n  "a": "A"\n}\n';
    expect(roundtrip(src, false)).toBe(src);
  });

  it("중첩: **각 층이** 원본 순서다 — 최상위만 맞으면 안 된다", () => {
    const src = '{\n  "b": {\n    "y": "Y",\n    "x": "X"\n  },\n  "a": "A"\n}\n';
    expect(roundtrip(src, true)).toBe(src);
  });

  it("3층 중첩도 층마다 원본 순서다", () => {
    const src = '{\n  "z": {\n    "n": {\n      "q": "Q",\n      "p": "P"\n    },\n    "m": "M"\n  },\n  "a": "A"\n}\n';
    expect(roundtrip(src, true)).toBe(src);
  });

  it("배열은 인덱스 순서를 유지한다 — order가 배열을 헤집지 않는다", () => {
    const src = '{\n  "list": [\n    "one",\n    "two",\n    "three"\n  ],\n  "a": "A"\n}\n';
    expect(roundtrip(src, true)).toBe(src);
  });

  it("order가 없으면 코드 유닛 순 — 기존 동작이 폴백으로 남는다", () => {
    const out = jsonCatalog.write(jsonFmt(false), {
      locale: "en",
      entries: [
        { key: "b", message: "B" },
        { key: "a", message: "A" },
      ],
    });
    expect(out).toBe('{\n  "a": "A",\n  "b": "B"\n}\n');
  });

  it("order가 섞여 있으면 있는 것이 먼저다", () => {
    const out = jsonCatalog.write(jsonFmt(false), {
      locale: "en",
      entries: [
        { key: "aaa", message: "A" },
        { key: "zzz", message: "Z", order: 0 },
      ],
    });
    expect(out).toBe('{\n  "zzz": "Z",\n  "aaa": "A"\n}\n');
  });

  it("결정적이다 — 같은 입력을 두 번 써서 같은 바이트", () => {
    const src = '{\n  "b": {\n    "y": "Y",\n    "x": "X"\n  },\n  "a": "A"\n}\n';
    expect(roundtrip(src, true)).toBe(roundtrip(src, true));
  });

  it("write → read → write 고정점", () => {
    const src = '{\n  "b": {\n    "y": "Y",\n    "x": "X"\n  },\n  "a": "A"\n}\n';
    const once = roundtrip(src, true)!;
    expect(roundtrip(once, true)).toBe(once);
  });
});

describe("chrome-locales.write — 원본 순서와 placeholders를 되돌린다", () => {
  it("정렬 안 된 원본이 바이트 그대로 돌아온다", () => {
    const src = '{\n  "C": {\n    "message": "c"\n  },\n  "A": {\n    "message": "a"\n  }\n}\n';
    expect(chromeRoundtrip(src)).toBe(src);
  });

  it("placeholders 블록이 살아 돌아온다 — 안의 키 순서까지", () => {
    const src = [
      "{",
      '  "GREET": {',
      '    "message": "Hi $user$",',
      '    "placeholders": {',
      '      "z": {',
      '        "content": "$1"',
      "      },",
      '      "a": {',
      '        "content": "$2"',
      "      }",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(chromeRoundtrip(src)).toBe(src);
  });

  it("객체가 아닌 placeholders도 그대로 되돌린다 — 버리면 우리가 손실을 만든다", () => {
    const src = '{\n  "A": {\n    "message": "a",\n    "placeholders": "nope"\n  }\n}\n';
    expect(chromeRoundtrip(src)).toBe(src);
  });

  it("placeholders가 없으면 필드를 만들지 않는다", () => {
    const out = chromeRoundtrip('{\n  "A": {\n    "message": "a"\n  }\n}\n');
    expect(out).not.toContain("placeholders");
  });

  it("base의 description은 그대로 낸다 (기존 동작)", () => {
    const src = '{\n  "A": {\n    "message": "a",\n    "description": "d"\n  }\n}\n';
    expect(chromeRoundtrip(src)).toBe(src);
  });

  it("비-base의 description도 낸다 — 그 파일이 실제로 갖고 있던 값이다", () => {
    // 태스크 4에서 `Translation.description`이 생기며 `isBase` 가드를 풀었다. 로케일별 값이
    // 셀에서 오므로 base 값을 복제할 위험이 사라졌고, chrome 리포 33개 중 20개가 잃던 필드다
    // (`docs/ARCHITECTURE §1.9` §10.3).
    const src = '{\n  "A": {\n    "message": "a",\n    "description": "d"\n  }\n}\n';
    expect(chromeRoundtrip(src)).toBe(src);
  });

  it("결정적이다 — 같은 입력을 두 번 써서 같은 바이트", () => {
    const entries: LocaleEntry[] = [
      { key: "C", message: "c", order: 0 },
      { key: "A", message: "a", order: 1, placeholders: { u: { content: "$1" } } },
    ];
    const w = () => chromeLocales.write(chromeFmt, { locale: "en", entries });
    expect(w()).toBe(w());
  });

  it("배열 위치가 아니라 order에만 의존한다", () => {
    const entries: LocaleEntry[] = [
      { key: "C", message: "c", order: 0 },
      { key: "A", message: "a", order: 1 },
    ];
    const w = (list: LocaleEntry[]) => chromeLocales.write(chromeFmt, { locale: "en", entries: list });
    expect(w([...entries].reverse())).toBe(w(entries));
  });
});
