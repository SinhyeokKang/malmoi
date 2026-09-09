import { describe, expect, it } from "vitest";
import { exceedsGlobBudget, matchGlobPaths } from "../shared";
import { selectLocaleFiles } from "@/lib/push/payload";
import { resolveLocalePaths } from "@/lib/pull/plan";
import type { DetectedFormat } from "../types";

/**
 * **`multi-locale`의 파일 선택은 규칙이 하나여야 한다** (2026-09-04 audit #3).
 *
 * 셋이 각자 규칙을 들었던 동안 push는 하위 디렉터리와 `.tsx`를 포함하고 pull의 글롭은 둘 다
 * 뺐다. 그 차이에 걸린 파일은 **키가 DB에 적재되고 편집 UI에 뜨는데 pull이 그 파일을 영영
 * 쓰지 않는다** — 번역이 리포에 도달하지 않고 에러도 없다.
 *
 * 확장자의 진실은 `pathTemplate`이다. `.tsx`를 담아야 하면 `detect`가 `*.tsx`를 내야 한다.
 */

const TMPL = "src/i18n/namespaces/*.ts";
const PATHS = [
  "src/i18n/namespaces/common.ts",
  "src/i18n/namespaces/app.tsx",
  "src/i18n/namespaces/legacy/old.ts",
  "src/i18n/namespaces/__tests__/common.test.ts",
  "src/i18n/index.ts",
  "src/i18n/namespaces/readme.md",
];

describe("matchGlobPaths — 글롭이 유일한 규칙이다", () => {
  it("`*`가 `/`를 먹지 않는다 — 하위 디렉터리는 뺀다", () => {
    expect(matchGlobPaths(TMPL, PATHS)).toEqual(["src/i18n/namespaces/common.ts"]);
  });

  it("템플릿 확장자가 진실이다 — `*.ts`는 `.tsx`를 잡지 않는다", () => {
    expect(matchGlobPaths("d/*.tsx", ["d/a.ts", "d/a.tsx"])).toEqual(["d/a.tsx"]);
  });

  it("정규식 특수문자를 이스케이프한다 — `?`를 빼먹으면 조용히 다른 파일을 잡는다", () => {
    expect(matchGlobPaths("a.b/*.ts", ["axb/c.ts", "a.b/c.ts"])).toEqual(["a.b/c.ts"]);
  });

  it("정렬해 돌려준다 — 이 순서가 트리 페이로드 순서가 되고 흔들리면 커밋이 비결정적이다", () => {
    expect(matchGlobPaths("d/*.ts", ["d/z.ts", "d/a.ts"])).toEqual(["d/a.ts", "d/z.ts"]);
  });
});

describe("push·pull이 같은 파일 집합을 고른다 (survey도 같은 함수를 쓴다)", () => {
  const format: DetectedFormat = { adapter: "ts-dict", pathTemplate: TMPL, locales: ["ko", "en"] };

  it("selectLocaleFiles와 resolveLocalePaths의 경로가 일치한다", () => {
    const pushPaths = selectLocaleFiles("multi-locale", format, PATHS, (p) => `c:${p}`).map((f) => f.path);
    const pullPaths = resolveLocalePaths(format, "multi-locale", PATHS).map((p) => p.path);
    expect(pushPaths).toEqual(pullPaths);
    expect(pushPaths).toEqual(["src/i18n/namespaces/common.ts"]);
  });
});

/**
 * **글롭 템플릿에 상한을 둔다** (sec-audit 발견 11).
 *
 * `pathTemplate.replaceAll("*", "[^/]*")` + `new RegExp(...)`이라 **인접한 `*` k개**는 매칭 실패
 * 경로에서 n글자를 k조각으로 나누는 모든 경우를 훑어 지수 시간이 된다. 메타문자는 이스케이프되니
 * 주입이 아니라 ReDoS이고, 값을 정하는 것은 **클라이언트**다(`CreateProjectInput` ·
 * `PushPayload.format` 둘 다 `z.string().min(1)`뿐이었다).
 *
 * ⚠️ **타이머로 재지 않는다** — 느린 CI에서 흔들리고, 무엇보다 "상한이 있다"는 판정이 순수 함수의
 * **반환값**에 드러나야 저장된 템플릿(cron 경로)에서도 같은 답이 나온다.
 *
 * ⚠️ **상한을 넘으면 빈 배열이다.** 조용한 통과가 아니라 pull의 `fail("the glob matched no files")`로
 * 시끄럽게 멈추는 쪽이다 — 어느 파일도 안 고르는 것이 안전한 기본값이다.
 */
describe("matchGlobPaths — 템플릿 상한 (sec-audit 11)", () => {
  it("실제 템플릿은 예산 안이다 — 상한이 정상 경로를 막지 않는다", () => {
    expect(exceedsGlobBudget("src/i18n/namespaces/*.ts")).toBe(false);
    expect(exceedsGlobBudget("locales/{locale}.json")).toBe(false);
    expect(exceedsGlobBudget("public/_locales/{locale}/messages.json")).toBe(false);
  });

  it("인접 양자가 예산을 넘으면 거부한다", () => {
    expect(exceedsGlobBudget("d/****.ts")).toBe(false);
    expect(exceedsGlobBudget("d/*****.ts")).toBe(true);
  });

  it("`{locale}`도 같은 예산을 쓴다 — per-locale 경로가 인접 `([^/]+)`를 만든다", () => {
    expect(exceedsGlobBudget("l/{locale}{locale}{locale}{locale}{locale}.json")).toBe(true);
  });

  it("템플릿 길이 상한", () => {
    expect(exceedsGlobBudget(`d/${"a".repeat(197)}`)).toBe(false);
    expect(exceedsGlobBudget(`d/${"a".repeat(199)}`)).toBe(true);
  });

  it("예산을 넘으면 매칭되는 파일이 있어도 빈 배열이다", () => {
    // 상한 이내에서는 그대로 잡는다 — 이 줄이 없으면 "늘 빈 배열"도 통과한다
    expect(matchGlobPaths("d/****.ts", ["d/abc.ts"])).toEqual(["d/abc.ts"]);
    expect(matchGlobPaths("d/*****.ts", ["d/abc.ts"])).toEqual([]);
    expect(matchGlobPaths(`d/${"a".repeat(199)}*`, [`d/${"a".repeat(199)}x`])).toEqual([]);
  });
});
