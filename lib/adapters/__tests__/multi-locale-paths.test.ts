import { describe, expect, it } from "vitest";
import { matchGlobPaths } from "../shared";
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
