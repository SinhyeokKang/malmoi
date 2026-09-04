import { describe, expect, it } from "vitest";
import { changedHunks, roundtripDiffRatio } from "@/lib/survey/diff";
import { chromeLocales, jsonCatalog } from "../index";
import type { Adapter, AdapterFile, DetectedFormat } from "../types";

/**
 * **L2 — 골든 픽스처** (`docs/features/key-order-preservation/` 태스크 5-2).
 *
 * 완료 조건의 diff 수치는 `pnpm adapter-survey`가 낸다. 그건 리포 129개를 clone하는 네트워크
 * 작업이라 `pnpm test`에도 CI에도 못 들어가고, **캐시가 없어 매 실행이 ~4분이다.** 그래서 한 번
 * 재고 끝나는 값이 되기 쉽다 — 다음 날 누가 `orderedEntries`를 되돌려도 아무 게이트도 안 빨개진다.
 *
 * 이 파일이 그 수치를 **오프라인 상시 단언으로 번역한다**: 실측 리포에서 관측한 모양을 인라인
 * 픽스처로 박고, `lib/survey/diff.ts`의 **프로덕션 함수를 그대로 import**해 코퍼스 지표와 같은
 * 자로 잰다. 다른 자를 쓰면 여기가 green인데 실측이 red인 상태가 가능해진다.
 *
 * ⚠️ **픽스처는 인라인 템플릿 리터럴이다.** 리포에 fixture 디렉터리를 두지 않는 관례를 따르고
 * (`yaml-catalog.test.ts`), 남의 리포 파일을 통째로 커밋하지 않아 라이선스 문제도 피한다.
 */

const f = (path: string, content: string): AdapterFile => ({ path, content });

const jsonFmt: DetectedFormat = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en"] };
const chromeFmt: DetectedFormat = {
  adapter: "chrome-locales",
  pathTemplate: "_locales/{locale}/messages.json",
  locales: ["en"],
};

/**
 * read → write 한 바퀴. 원본이 그대로 나오는지가 이 기능의 정의다.
 *
 * ⚠️ **`currentFiles`를 반드시 싣는다.** 화이트리스트 스프레드라 여기서 빠뜨리면 writer가
 * 원본을 못 받아 **전부 기본값 경로로 흐른다** — 표현 축 픽스처를 아무리 늘려도 그 축은
 * 검증되지 않고 "픽스처만 는다" (`/feature-review` 2026-09-04).
 */
function roundtrip(adapter: Adapter, fmt: DetectedFormat, path: string, content: string): string {
  const r = adapter.read(fmt, [f(path, content)]);
  expect(r.errors).toEqual([]);
  const out = adapter.write(
    { ...fmt, nested: r.nested, nestedByPath: r.nestedByPath, currentFiles: [f(path, content)] },
    { locale: "en", isBase: true, entries: r.locales[0]!.entries },
  );
  expect(out).not.toBeNull();
  return out!;
}

// ── 실측 리포에서 관측한 네 모양 ────────────────────────────────────────
// 형태만 옮기고 문자열은 우리 것으로 바꿨다. 재는 것은 **구조**이지 남의 문구가 아니다.

/** ① 정렬 안 된 flat — gitea·zulip 형태 (`{locale}.json`, 점 표기). */
const FLAT_UNSORTED = [
  "{",
  '  "repo.settings": "Settings",',
  '  "auth.sign_in": "Sign In",',
  '  "repo.branches": "Branches",',
  '  "admin.users": "Users",',
  '  "auth.sign_out": "Sign Out"',
  "}",
  "",
].join("\n");

/** ② 중첩 + 배열 — excalidraw·open-webui 형태. **하위 층까지 순서가 유지돼야 한다.** */
const NESTED_WITH_ARRAY = [
  "{",
  '  "toolBar": {',
  '    "selection": "Selection",',
  '    "rectangle": "Rectangle",',
  '    "arrow": "Arrow"',
  "  },",
  '  "alerts": {',
  '    "cannotExport": "Cannot export",',
  '    "couldNotLoad": "Could not load"',
  "  },",
  '  "hints": [',
  '    "Drag to move",',
  '    "Shift to constrain"',
  "  ],",
  '  "labels": {',
  '    "zoomIn": "Zoom in",',
  '    "canvasBackground": "Canvas background"',
  "  }",
  "}",
  "",
].join("\n");

/**
 * 점 포함 키가 중첩과 공존 — siyuan·musicblocks 형태.
 *
 * **순서 보존이 아니라 다른 미해결 문제를 재는 픽스처다** (아래 §알려진 한계).
 */
const DOTTED_AND_NESTED = [
  "{",
  '  "menu.open": "Open",',
  '  "dialog": {',
  '    "confirm": "Confirm",',
  '    "cancel": "Cancel"',
  "  },",
  '  "menu.close": "Close"',
  "}",
  "",
].join("\n");

/** ③ chrome `_locales` — placeholders와 description이 함께 있는 모양. */
const CHROME_FULL = [
  "{",
  '  "EXT_NAME": {',
  '    "message": "Sample Extension",',
  '    "description": "Extension name"',
  "  },",
  '  "GREETING": {',
  '    "message": "Hello $USER$",',
  '    "placeholders": {',
  '      "USER": {',
  '        "content": "$1",',
  '        "example": "Alice"',
  "      }",
  "    }",
  "  },",
  '  "CMD_OPEN": {',
  '    "message": "Open panel"',
  "  }",
  "}",
  "",
].join("\n");

const CASES: ReadonlyArray<{ name: string; adapter: Adapter; fmt: DetectedFormat; path: string; src: string }> = [
  { name: "① 정렬 안 된 flat (gitea·zulip 형태)", adapter: jsonCatalog, fmt: jsonFmt, path: "i18n/en.json", src: FLAT_UNSORTED },
  { name: "② 중첩 + 배열 (excalidraw·open-webui 형태)", adapter: jsonCatalog, fmt: jsonFmt, path: "i18n/en.json", src: NESTED_WITH_ARRAY },
  { name: "③ chrome _locales (placeholders + description)", adapter: chromeLocales, fmt: chromeFmt, path: "_locales/en/messages.json", src: CHROME_FULL },
];

describe("L2 — 실측 모양에서 첫 write가 원본을 재정렬하지 않는다", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it("write 출력이 원본과 **바이트 동일**하다", () => {
        expect(roundtrip(c.adapter, c.fmt, c.path, c.src)).toBe(c.src);
      });

      it("코퍼스와 **같은 자**로 재도 diff 비율이 0이다", () => {
        // 프로덕션 함수를 그대로 부른다 — 다른 구현을 쓰면 여기가 green인데 실측이 red일 수 있다.
        expect(roundtripDiffRatio(c.src, roundtrip(c.adapter, c.fmt, c.path, c.src))).toBe(0);
      });

      it("hunk가 0이다 — 비율이 낮아도 흩어져 있으면 리뷰가 불가능하다", () => {
        expect(changedHunks(c.src, roundtrip(c.adapter, c.fmt, c.path, c.src))).toBe(0);
      });

      it("write → read → write **바이트 고정점**", () => {
        const once = roundtrip(c.adapter, c.fmt, c.path, c.src);
        expect(roundtrip(c.adapter, c.fmt, c.path, once)).toBe(once);
      });
    });
  }
});

describe("L2 — 값을 편집하면 그 줄만 움직인다", () => {
  it("키 하나를 바꾸면 hunk가 1이다 — 재정렬이면 여러 군데로 흩어진다", () => {
    const r = jsonCatalog.read(jsonFmt, [f("i18n/en.json", NESTED_WITH_ARRAY)]);
    const entries = r.locales[0]!.entries.map((e) =>
      e.key === "alerts.couldNotLoad" ? { ...e, message: "Load failed" } : e,
    );
    const out = jsonCatalog.write(
      { ...jsonFmt, nested: r.nested, nestedByPath: r.nestedByPath },
      { locale: "en", isBase: true, entries },
    )!;
    expect(changedHunks(NESTED_WITH_ARRAY, out)).toBe(1);
    // "몇 줄 바뀌었나"도 함께 본다 — 한 줄 변경이 파일 전체 diff로 번지지 않는다.
    expect(roundtripDiffRatio(NESTED_WITH_ARRAY, out)).toBeLessThan(0.1);
  });
});

describe("L2 — 엣지 케이스", () => {
  const write = (entries: Parameters<Adapter["write"]>[1]["entries"]) =>
    jsonCatalog.write(jsonFmt, { locale: "en", isBase: true, entries });

  it("order가 전부 없으면 코드 유닛 순 — 마이그레이션 직후 상태가 개정 전과 바이트 동일이다", () => {
    expect(write([{ key: "b", message: "B" }, { key: "a", message: "A" }])).toBe('{\n  "a": "A",\n  "b": "B"\n}\n');
  });

  it("orphaned가 order에 구멍을 내도 남은 순서가 유지된다", () => {
    expect(
      write([
        { key: "z", message: "Z", order: 0 },
        { key: "gone", message: "G", order: 1, orphaned: true },
        { key: "a", message: "A", order: 2 },
      ]),
    ).toBe('{\n  "z": "Z",\n  "a": "A"\n}\n');
  });

  it("빈 값이 order에 구멍을 내도 마찬가지다", () => {
    expect(
      write([
        { key: "z", message: "Z", order: 0 },
        { key: "empty", message: "", order: 1 },
        { key: "a", message: "A", order: 2 },
      ]),
    ).toBe('{\n  "z": "Z",\n  "a": "A"\n}\n');
  });

  it("낼 것이 0개면 null이다 — 빈 객체는 '이 로케일 지원함'으로 읽힌다", () => {
    expect(write([{ key: "gone", message: "G", order: 0, orphaned: true }])).toBeNull();
  });

  it("로케일마다 키 집합이 달라도 각자의 order로 조립된다", () => {
    const en = jsonCatalog.read(jsonFmt, [f("i18n/en.json", FLAT_UNSORTED)]);
    // ko에는 두 키가 빠져 있다 — 번역이 덜 된 정상 상태다.
    const partial = en.locales[0]!.entries.filter((e) => !e.key.startsWith("admin."));
    const out = jsonCatalog.write(jsonFmt, { locale: "ko", isBase: false, entries: partial })!;
    expect(out).toBe(
      '{\n  "repo.settings": "Settings",\n  "auth.sign_in": "Sign In",\n  "repo.branches": "Branches",\n  "auth.sign_out": "Sign Out"\n}\n',
    );
  });
});

describe("L2 — 알려진 한계: `.`가 조인 구분자여서 생기는 모양 변형", () => {
  /**
   * ⚠️ **순서 보존과 다른 축의 문제다.** `.`가 우리 조인 구분자이면서 실제 키에 든 문자라
   * flatten/unflatten이 단사가 아니다 (POSTMORTEM 2026-09-02). 파일에 중첩이 **하나라도** 있으면
   * `nested`가 서고, 그러면 `"menu.open"`이 경로로 쪼개져 `{"menu": {"open": …}}`로 복원된다.
   *
   * 여기에 기대값을 박아 **기준선**으로 둔다 — 키 구분자를 계약으로 빼는 별 기능
   * (`nested: boolean` → `tree: {style, separator}`, `docs/TASKS.md` §8 후속 1번)이 이걸 고치면
   * 이 테스트가 red가 되고, 그때가 바로 이 한계가 사라지는 순간이다.
   */
  it("중첩과 공존하면 점 키가 경로로 쪼개진다 — 순서는 지켜지지만 구조가 바뀐다", () => {
    const out = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", DOTTED_AND_NESTED);
    expect(out).toBe(
      ["{", '  "menu": {', '    "open": "Open",', '    "close": "Close"', "  },", '  "dialog": {', '    "confirm": "Confirm",', '    "cancel": "Cancel"', "  }", "}", ""].join("\n"),
    );
    // **순서 자체는 지켜졌다** — `menu`가 먼저고 `dialog`가 뒤다(파일 순서). 쪼개진 것만이 문제다.
    expect(out.indexOf('"menu"')).toBeLessThan(out.indexOf('"dialog"'));
  });

  it("중첩이 없으면 점 키가 그대로 남는다 — flat write는 키를 쪼개지 않는다", () => {
    const flatDotted = '{\n  "menu.open": "Open",\n  "menu.close": "Close"\n}\n';
    expect(roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", flatDotted)).toBe(flatDotted);
  });

  it("고정점은 그래도 성립한다 — 한 번 바뀐 모양이 계속 흔들리지는 않는다", () => {
    const once = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", DOTTED_AND_NESTED);
    expect(roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", once)).toBe(once);
  });
});

// ── 표현 축 픽스처 (원본 포맷 보존 태스크 6) ──────────────────────────────
// 실측: 재생성 리포 71개 중 **30개**가 2칸이 아니다 (`ADAPTER-COVERAGE.md` §11.3).
// 4칸 파일에 2칸을 쓰면 값 편집이 0건이어도 **모든 줄이 바뀐다.**

/**
 * ⑤ 4칸 들여쓰기 — jellyfin-web·vikunja 형태. 학습 코퍼스에서 12개가 이 폭이다.
 *
 * ⚠️ **점 키와 중첩을 섞지 않는다.** 섞으면 `read`가 nested를 관측해 점 키를 쪼개고, 그건
 * 들여쓰기 축이 아니라 `dottedWithNested`(키 구분자 계약의 몫)를 재게 된다.
 */
const FOUR_SPACE = [
  "{",
  '    "nav": {',
  '        "home": "Home",',
  '        "about": "About"',
  "    },",
  '    "footer": {',
  '        "terms": "Terms"',
  "    }",
  "}",
  "",
].join("\n");

/** ⑥ 탭 들여쓰기 — siyuan 형태. 학습 7개. */
const TAB_INDENT = ["{", '\t"a.one": "One",', '\t"a.two": "Two"', "}", ""].join("\n");

describe("L2 — 표현: 들여쓰기가 원본대로 나온다", () => {
  for (const [name, src] of [
    ["4칸", FOUR_SPACE],
    ["탭", TAB_INDENT],
  ] as const) {
    it(`${name}: 값이 안 바뀌면 원본과 바이트 동일이다`, () => {
      const out = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", src);
      expect(out).toBe(src);
      expect(roundtripDiffRatio(src, out)).toBe(0);
      expect(changedHunks(src, out) ?? -1).toBe(0);
    });

    it(`${name}: 2차 write가 1차와 같다 (바이트 고정점)`, () => {
      const first = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", src);
      const second = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", first);
      expect(second).toBe(first);
    });
  }

  it("chrome도 원본 들여쓰기를 따른다", () => {
    const src = [
      "{",
      '    "hello": {',
      '        "message": "Hello"',
      "    }",
      "}",
      "",
    ].join("\n");
    const out = roundtrip(chromeLocales, chromeFmt, "_locales/en/messages.json", src);
    expect(out).toBe(src);
  });

  it("원본을 안 주면 2칸이다 — 재생성은 원본 없이도 파일을 만든다 (신규 로케일)", () => {
    const out = jsonCatalog.write(jsonFmt, {
      locale: "en",
      isBase: true,
      entries: [{ key: "a", message: "하나" }],
    });
    expect(out).toBe('{\n  "a": "하나"\n}\n');
  });
});

/**
 * ⑦ 한 줄 엔트리 chrome — button-stealer 형태. `"k": { "message": "…" }`가 흔한 관례라
 * 펼치면 **순서가 완벽해도 파일 전체가 diff**였다 (실측 0.964, 38줄 → 128줄).
 */
const COMPACT_CHROME = [
  "{",
  '  "extName": { "message": "Button Stealer" },',
  '  "extDesc": { "message": "Steal every button", "description": "store listing" },',
  '  "wide": {',
  '    "message": "Wide"',
  "  }",
  "}",
  "",
].join("\n");

/** ⑧ 비ASCII를 `\uXXXX`로 쓴 원본 — 풀어 쓰면 그 줄 전부가 diff다. */
const ESCAPED = ["{", '  "hi": "\\ud55c\\uae00",', '  "plain": "Plain"', "}", ""].join("\n");

describe("L2 — 표현: 한 줄 컨테이너와 비ASCII 이스케이프가 원본대로 나온다", () => {
  it("한 줄 엔트리는 한 줄로, 펼쳐진 엔트리는 펼친 채로 나온다", () => {
    const out = roundtrip(chromeLocales, chromeFmt, "_locales/en/messages.json", COMPACT_CHROME);
    expect(out).toBe(COMPACT_CHROME);
    expect(changedHunks(COMPACT_CHROME, out) ?? -1).toBe(0);
  });

  it("한 줄 엔트리: 2차 write가 1차와 같다 (바이트 고정점)", () => {
    const first = roundtrip(chromeLocales, chromeFmt, "_locales/en/messages.json", COMPACT_CHROME);
    expect(roundtrip(chromeLocales, chromeFmt, "_locales/en/messages.json", first)).toBe(first);
  });

  it("`\\uXXXX` 원본은 이스케이프된 채로 나온다", () => {
    const out = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", ESCAPED);
    expect(out).toBe(ESCAPED);
    expect(roundtripDiffRatio(ESCAPED, out)).toBe(0);
  });

  it("대문자 헥사는 소문자로 **한 번** 정규화되고 그다음이 고정점이다 (알려진 근사)", () => {
    const upper = ["{", '  "hi": "\\uD55C\\uAD6D"', "}", ""].join("\n");
    const first = roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", upper);
    expect(first).toBe(["{", '  "hi": "\\ud55c\\uad6d"', "}", ""].join("\n"));
    expect(roundtrip(jsonCatalog, jsonFmt, "i18n/en.json", first)).toBe(first);
  });
});
