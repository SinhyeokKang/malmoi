import { describe, expect, it } from "vitest";

import { detectFormatWith, matchGlobPaths } from "@/lib/adapters";
import type { AdapterFile } from "@/lib/adapters/types";

import { makeProbe } from "../detect";
import { planConfirmedFormat, templatePaths } from "../confirm";

/**
 * 확정은 **파일을 다시 읽어 재검증**한다 (design §3.4). 클라이언트가 보낸 `adapterName`·`pathTemplate`을
 * 그대로 저장하면 임의의 `pathTemplate`으로 pull이 리포의 아무 파일이나 덮어쓰는 커밋을 만든다.
 *
 * ⚠️ **저장하는 것은 `detectFormatWith`의 반환값이다** — 클라이언트 입력이 아니다. 검증한 값을 저장하지
 * 않으면 검증이 장식이다 (POSTMORTEM 2026-09-05).
 *
 * 자동 후보와 수동 지정이 **한 경로**다 — `ts-dict`는 `detect`가 그 디렉터리 `.ts` 최대 4개를 읽어야
 * 매치하므로 이 경로가 아니면 수동 지정이 항상 거부된다 (design §3.5).
 */

const f = (path: string, content: string): AdapterFile => ({ path, content });

const TS_NS = (ns: string) => `const ko = { "${ns}.ok": "확인" } as const;
const en = { "${ns}.ok": "OK" } satisfies Bundle;
export const ${ns} = { ko, en };
`;

describe("templatePaths — 템플릿이 가리키는 파일 경로", () => {
  const TREE = [
    "src/locales/en.json",
    "src/locales/ko.json",
    "src/locales/index.json",
    "src/locales/en/extra.json",
    "other/en.json",
    "_locales/en/messages.json",
    "_locales/ko/messages.json",
    "src/i18n/namespaces/common.ts",
    "src/i18n/namespaces/editor.ts",
    "src/i18n/namespaces/sub/deep.ts",
    "src/i18n/types.ts",
  ];

  it("per-locale: `{locale}`을 트리의 파일명으로 치환해 교집합을 낸다 — 로케일로 보이는 이름만", () => {
    expect(templatePaths("json-catalog", "src/locales/{locale}.json", TREE)).toEqual([
      "src/locales/en.json",
      "src/locales/ko.json",
    ]);
  });

  it("per-locale: `{locale}`이 디렉터리 자리여도 된다 (chrome)", () => {
    expect(templatePaths("chrome-locales", "_locales/{locale}/messages.json", TREE)).toEqual([
      "_locales/en/messages.json",
      "_locales/ko/messages.json",
    ]);
  });

  it("multi-locale: `matchGlobPaths`와 같다 — 하위 디렉터리는 안 걸린다", () => {
    const out = templatePaths("ts-dict", "src/i18n/namespaces/*.ts", TREE);
    expect(out).toEqual(["src/i18n/namespaces/common.ts", "src/i18n/namespaces/editor.ts"]);
    expect(out).toEqual(matchGlobPaths("src/i18n/namespaces/*.ts", TREE));
  });

  it("아무 파일도 가리키지 않으면 빈 배열이다 — 호출부가 `manual-no-match`로 접는다", () => {
    expect(templatePaths("json-catalog", "nowhere/{locale}.json", TREE)).toEqual([]);
    // per-locale인데 `{locale}`이 없는 템플릿은 어느 파일도 가리키지 못한다.
    expect(templatePaths("json-catalog", "src/locales/en.json", TREE)).toEqual([]);
  });

  it("모르는 어댑터 이름은 빈 배열이다 — per-locale 분기에 떨어지지 않는다", () => {
    expect(templatePaths("nope" as never, "src/locales/{locale}.json", TREE)).toEqual([]);
  });

  it("정규식 특수문자가 들어간 경로도 리터럴로 다룬다", () => {
    expect(templatePaths("json-catalog", "a+b/{locale}.json", ["a+b/en.json", "aab/en.json", "a+b/ko.json"])).toEqual([
      "a+b/en.json",
      "a+b/ko.json",
    ]);
  });
});

describe("planConfirmedFormat — 입력 ↔ 재탐지 결과 대조", () => {
  const input = { adapter: "json-catalog", pathTemplate: "src/locales/{locale}.json", baseLocale: "en" };
  const FILES = [f("src/locales/en.json", '{"a":"A"}'), f("src/locales/ko.json", '{"a":"에이"}')];

  it("템플릿이 가리키는 파일이 0개면 `manual-no-match`다", () => {
    expect(planConfirmedFormat(input, [])).toEqual({ status: "rejected", reason: "manual-no-match" });
  });

  it("등록되지 않은 어댑터 이름은 거부다 — `isAdapterName`을 지난다", () => {
    expect(planConfirmedFormat({ ...input, adapter: "nope" }, FILES)).toEqual({
      status: "rejected",
      reason: "unknown-adapter",
    });
  });

  it("`detectFormatWith`가 아무것도 돌려주지 않으면 거부다 — 파일이 있어도 카탈로그 모양이 아니다", () => {
    const notCatalog = [f("src/locales/en.json", "[1,2,3]"), f("src/locales/ko.json", "[4,5]")];
    expect(planConfirmedFormat(input, notCatalog)).toEqual({ status: "rejected", reason: "not-detected" });
  });

  it("반환된 `pathTemplate`이 입력과 다르면 거부다 — 입력 템플릿이 이 리포에서 성립하지 않는다", () => {
    const elsewhere = [f("other/en.json", '{"a":"A"}'), f("other/ko.json", '{"a":"에이"}')];
    expect(planConfirmedFormat(input, elsewhere)).toEqual({ status: "rejected", reason: "template-mismatch" });
  });

  it("`baseLocale`이 **반환된** `locales`에 없으면 거부다", () => {
    expect(planConfirmedFormat({ ...input, baseLocale: "fr" }, FILES)).toEqual({
      status: "rejected",
      reason: "base-locale-missing",
    });
  });

  it("통과 시 `format`은 `detectFormatWith` 결과 그 자체다 — 클라이언트 입력이 아니다", () => {
    const out = planConfirmedFormat(input, FILES);
    const expected = detectFormatWith(
      "json-catalog",
      FILES.map((x) => x.path),
      makeProbe(new Map(FILES.map((x) => [x.path, x.content]))),
    );
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.format).toEqual(expected);
    // 입력엔 locales가 없다 — 이 값은 재탐지가 채운 것이다.
    expect(out.format.locales.slice().sort()).toEqual(["en", "ko"]);
    expect(out.baseLocale).toBe("en");
  });

  it("`ts-dict` 수동 지정이 통과한다 — 디렉터리의 `.ts` 4개를 읽어야 매치한다 (design §3.5)", () => {
    const files = ["common", "editor", "settings", "ai"].map((ns) => f(`src/i18n/namespaces/${ns}.ts`, TS_NS(ns)));
    const out = planConfirmedFormat(
      { adapter: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts", baseLocale: "en" },
      files,
    );
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.format.adapter).toBe("ts-dict");
    expect(out.format.pathTemplate).toBe("src/i18n/namespaces/*.ts");
    expect(out.format.locales.slice().sort()).toEqual(["en", "ko"]);
  });

  it("`code-dict` 수동 지정도 같은 경로다", () => {
    const files = [
      f("src/locale/en.ts", 'export default { ok: "OK" }'),
      f("src/locale/ko.ts", 'export default { ok: "확인" }'),
    ];
    const out = planConfirmedFormat({ adapter: "code-dict", pathTemplate: "src/locale/{locale}.ts", baseLocale: "ko" }, files);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.format.pathTemplate).toBe("src/locale/{locale}.ts");
    expect(out.baseLocale).toBe("ko");
  });
});
