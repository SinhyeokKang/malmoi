import { describe, expect, it } from "vitest";

import { codeDictCandidatePaths } from "../code-dict";
import { codeDict } from "../index";
import type { FileProbe } from "../types";

/**
 * `codeDictCandidatePaths` — `detectCandidates`의 **probe 이전 부분**을 분리·export한 것 (ARCHITECTURE §3.1).
 *
 * 온보딩은 GitHub API라 probe가 동기적으로 없다. code-dict는 probe 없이 후보 0개이므로(`if (!probe) return []`)
 * 내려받을 파일을 고를 근거가 없다 — 경로 그룹만 먼저 얻어야 한다. 정규식을 `lib/onboarding/`에 복사하지
 * 않는 이유는 공급층이 두 벌이면 POSTMORTEM 2026-09-02의 형태이기 때문이다.
 *
 * ⚠️ **판정 불변이 요지다.** `detectCandidates`가 이 함수를 그대로 부르므로 그 결과는 이 함수 결과의
 * 부분집합이고 순서가 보존된다 — 아래가 그것을 단언한다. `lib/adapters/**` 변경이지만 재측정 트리거가 아니다.
 */

const DICT = 'export default { greeting: "hello", nested: { ok: "OK" } }';
const NOT_DICT = "export const x = 1;";

const PATHS = [
  // 진짜 딕셔너리 (probe가 객체를 준다)
  "src/locale/en.ts",
  "src/locale/ko.ts",
  // 로케일 이름이지만 도메인 모듈 (probe가 객체를 안 준다)
  "src/data/en.ts",
  "src/data/ko.ts",
  // 로케일 이름이 아닌 파일 — 어느 쪽에도 없다
  "src/lib/foo.ts",
  "src/lib/bar.ts",
  // 로케일이 하나뿐 — 그룹 탈락
  "src/x/en.ts",
  // 강한 로케일이 없는 3글자 모음 — 그룹 탈락 (홀드아웃 오탐 2건이 정확히 이 모양)
  "src/y/abc.ts",
  "src/y/def.ts",
];

const probe: FileProbe = (p) => (p.startsWith("src/locale/") ? DICT : NOT_DICT);

describe("codeDictCandidatePaths — probe 없이 경로 그룹을 낸다", () => {
  it("detectCandidates는 probe 없이 빈 배열이지만 이 함수는 그룹을 낸다 — 그것이 분리한 이유다", () => {
    expect(codeDict.detectCandidates(PATHS)).toEqual([]);
    expect(codeDictCandidatePaths(PATHS).length).toBeGreaterThan(0);
  });

  it("그룹은 `{ pathTemplate, locales }`이고 템플릿이 `<dir>{locale}.<ext>` 모양이다", () => {
    const groups = codeDictCandidatePaths(PATHS);
    const templates = groups.map((g) => g.pathTemplate);
    expect(templates).toContain("src/locale/{locale}.ts");
    expect(templates).toContain("src/data/{locale}.ts");
    const locale = groups.find((g) => g.pathTemplate === "src/locale/{locale}.ts");
    expect([...(locale?.locales ?? [])].sort()).toEqual(["en", "ko"]);
  });

  it("로케일 1개 그룹과 강한 로케일이 없는 그룹은 빠진다 — detectCandidates와 같은 필터다", () => {
    const templates = codeDictCandidatePaths(PATHS).map((g) => g.pathTemplate);
    expect(templates).not.toContain("src/x/{locale}.ts");
    expect(templates).not.toContain("src/y/{locale}.ts");
    expect(templates).not.toContain("src/lib/{locale}.ts");
  });

  it("확장자가 다르면 다른 그룹이다 (tsx·js·mjs 포함)", () => {
    const templates = codeDictCandidatePaths([
      "src/l/en.ts",
      "src/l/ko.ts",
      "src/l/en.js",
      "src/l/ko.js",
      "src/m/en.tsx",
      "src/m/ko.tsx",
      "src/n/en.mjs",
      "src/n/ko.mjs",
    ]).map((g) => g.pathTemplate);
    expect(templates.sort()).toEqual([
      "src/l/{locale}.js",
      "src/l/{locale}.ts",
      "src/m/{locale}.tsx",
      "src/n/{locale}.mjs",
    ]);
  });

  it("순위는 rankCandidates와 같다 — i18n 신호가 있는 디렉터리가 로케일 수보다 앞이다", () => {
    const templates = codeDictCandidatePaths([
      "src/stuff/en.ts",
      "src/stuff/ko.ts",
      "src/stuff/ja.ts",
      "src/i18n/en.ts",
      "src/i18n/ko.ts",
    ]).map((g) => g.pathTemplate);
    expect(templates).toEqual(["src/i18n/{locale}.ts", "src/stuff/{locale}.ts"]);
  });
});

describe("codeDictCandidatePaths ⊇ detectCandidates — 판정 불변", () => {
  it("probe를 준 detectCandidates의 템플릿 집합은 이 함수 결과의 부분집합이다", () => {
    const groups = new Set(codeDictCandidatePaths(PATHS).map((g) => g.pathTemplate));
    const found = codeDict.detectCandidates(PATHS, probe);
    expect(found.map((c) => c.pathTemplate)).toEqual(["src/locale/{locale}.ts"]);
    for (const c of found) expect(groups.has(c.pathTemplate)).toBe(true);
  });

  it("상대 순서가 보존된다 — probe는 필터일 뿐 재정렬하지 않는다", () => {
    const paths = [
      "src/stuff/en.ts",
      "src/stuff/ko.ts",
      "src/stuff/ja.ts",
      "src/i18n/en.ts",
      "src/i18n/ko.ts",
      "src/other/en.ts",
      "src/other/ko.ts",
    ];
    const all = codeDictCandidatePaths(paths).map((g) => g.pathTemplate);
    const found = codeDict.detectCandidates(paths, () => DICT).map((c) => c.pathTemplate);
    expect(found).toEqual(all);
  });

  it("그룹의 로케일 집합이 detectCandidates의 locales와 같다", () => {
    const group = codeDictCandidatePaths(PATHS).find((g) => g.pathTemplate === "src/locale/{locale}.ts");
    const found = codeDict.detectCandidates(PATHS, probe)[0];
    expect([...(group?.locales ?? [])].sort()).toEqual([...(found?.locales ?? [])].sort());
  });
});
