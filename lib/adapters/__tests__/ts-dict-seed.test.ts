import { describe, expect, it } from "vitest";
import { detectCandidatesAcross } from "../index";
import { tsDictProbePaths } from "../ts-dict";

/**
 * `ts-dict` 자동 탐지의 **씨앗** — 경로만 보고 "내려받아 볼 디렉터리"를 고른다 (2026-09-14).
 *
 * ⚠️ **씨앗이 없으면 `detectCandidates`를 켜도 화면에는 아무것도 안 뜬다.** 온보딩은 2패스이고
 * 1패스는 경로만 보는데, `ts-dict`는 **내용을 봐야** 판단할 수 있어 1패스 후보가 0이다 → 그 파일이
 * `probeTargets`에 안 실리고 → 2패스에도 내용이 없어 또 0이다. 이 함수가 그 고리를 끊는다.
 *
 * ⚠️ **씨앗은 "후보"가 아니라 "내려받을 대상"이다.** 판정은 내용이 한다 — 아래 `src/i18n/`이 그
 * 성질의 증거다(파일마다 로케일 객체가 하나뿐이라 2패스에서 스스로 떨어진다).
 */

/** bugshot-2의 실제 모양 (2026-09-14 실측) — `.ts` 디렉터리 40여 개 중 i18n 신호는 셋이다. */
const BUGSHOT2 = [
  "src/i18n/bg-init.ts",
  "src/i18n/en.ts",
  "src/i18n/fr.ts",
  "src/i18n/index.ts",
  "src/i18n/ko.ts",
  "src/i18n/locales.ts",
  "src/i18n/__tests__/parity.test.ts",
  "src/i18n/__tests__/scan.test.ts",
  "src/i18n/namespaces/ai.ts",
  "src/i18n/namespaces/app.ts",
  "src/i18n/namespaces/common.ts",
  "src/i18n/namespaces/editor.ts",
  "src/i18n/namespaces/integrations.ts",
  "src/i18n/namespaces/issue.ts",
  "src/i18n/namespaces/logs.ts",
  "src/i18n/namespaces/settings.ts",
  "src/sidepanel/lib/a.ts",
  "src/sidepanel/lib/b.ts",
  "src/background/x.ts",
  "src/background/y.ts",
  "public/_locales/en/messages.json",
  "public/_locales/fr/messages.json",
  "public/_locales/ko/messages.json",
];

/** 네임스페이스 파일 — 비-export 로케일 객체 셋. `common.ts`의 실제 모양이다. */
const NAMESPACE_SOURCE = `
const ko = { "common.ok": "확인" };
const en = { "common.ok": "OK" };
const fr = { "common.ok": "OK" };
export const common = { ko, en, fr };
`;

/** `src/i18n/en.ts` — 로케일 객체가 **하나**뿐이라 딕셔너리가 아니다. */
const SINGLE_LOCALE_SOURCE = `
import { common } from "./namespaces/common";
const en = { ...common.en };
export default en;
`;

describe("tsDictProbePaths — 경로만 보는 씨앗", () => {
  it("i18n 신호가 있는 디렉터리만 고른다", () => {
    const picked = tsDictProbePaths(BUGSHOT2);
    const dirs = new Set(picked.map((p) => p.slice(0, p.lastIndexOf("/"))));
    expect(dirs).toContain("src/i18n/namespaces");
    // ⚠️ **`.ts` 디렉터리는 어디에나 있다** — 신호 없이 전부 고르면 blob 예산이 무너진다.
    expect([...dirs].some((d) => d.startsWith("src/sidepanel") || d.startsWith("src/background"))).toBe(false);
  });

  it("examples·tests 같은 곁가지는 제외한다", () => {
    const picked = tsDictProbePaths(BUGSHOT2);
    expect(picked.some((p) => p.includes("__tests__"))).toBe(false);
  });

  it("디렉터리당 4개까지만, 경로순으로 고른다", () => {
    const picked = tsDictProbePaths(BUGSHOT2);
    const ns = picked.filter((p) => p.startsWith("src/i18n/namespaces/"));
    /**
     * ⚠️ **내용 탐지가 읽는 4개와 같아야 한다** — 다른 4개를 받으면 후보가 "검증 실패"가 아니라
     * **미검증으로 통째로** 떨어진다 (`probeTargets`의 같은 경고와 한 쌍이다).
     */
    expect(ns).toEqual([
      "src/i18n/namespaces/ai.ts",
      "src/i18n/namespaces/app.ts",
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/editor.ts",
    ]);
  });

  it("파일이 하나뿐인 디렉터리는 딕셔너리가 아니다", () => {
    expect(tsDictProbePaths(["src/i18n/only.ts"])).toEqual([]);
  });

  it("상한을 넘지 않는다 — blob 예산이 응답 시간이다", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      [`src/i18n/g${i}/a.ts`, `src/i18n/g${i}/b.ts`],
    ).flat();
    // 디렉터리 2개 × 파일 4개.
    expect(tsDictProbePaths(many).length).toBeLessThanOrEqual(8);
  });
});

describe("자동 탐지에 ts-dict가 후보로 오른다", () => {
  const probe = (path: string): string | undefined =>
    path.startsWith("src/i18n/namespaces/") ? NAMESPACE_SOURCE
    : path.startsWith("src/i18n/") ? SINGLE_LOCALE_SOURCE
    // ⚠️ `_locales`도 내용을 준다 — probe가 있는데 `undefined`를 주면 그 후보가 **미검증으로**
    // 떨어져 "1순위 유지"를 재려던 검사가 대상을 잃는다.
    : path.includes("_locales/") ? '{"common.ok":{"message":"OK"}}'
    : undefined;

  it("내용이 확인되면 후보 목록에 있다", () => {
    const found = detectCandidatesAcross(BUGSHOT2, probe);
    expect(found.map((c) => c.pathTemplate)).toContain("src/i18n/namespaces/*.ts");
  });

  it("로케일 객체가 하나뿐인 디렉터리는 스스로 떨어진다 — 판정은 내용이 한다", () => {
    const found = detectCandidatesAcross(BUGSHOT2, probe);
    expect(found.map((c) => c.pathTemplate)).not.toContain("src/i18n/*.ts");
  });

  it("`_locales`가 1순위를 유지한다 — 기본 착지가 바뀌지 않는다", () => {
    const found = detectCandidatesAcross(BUGSHOT2, probe);
    expect(found[0]?.adapter).toBe("chrome-locales");
  });
});
