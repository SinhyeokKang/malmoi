import { describe, expect, it } from "vitest";

import { isPathSafeLocale, isPathSafeRepoPath } from "../locale-code";

/**
 * **로케일 코드가 리포 쓰기 경로에 보간된다** (sec-audit 발견 2).
 *
 * `lib/pull/plan.ts`의 per-locale 갈래가 `pathTemplate.replaceAll("{locale}", locale)`을 하고, 그
 * 결과가 **트리에 실존하는지와 무관하게** 커밋의 트리 엔트리가 된다(새 로케일 파일을 만들어야 하므로
 * 트리를 안 보는 것이 그 갈래의 요지다). 그래서 로케일 코드는 **파일명 한 조각**이고, 그것을 정하는
 * 것은 `/api/push`의 페이로드다.
 *
 * ⚠️ **`looksLikeLocale`을 재사용하지 않는다** — 그 함수는 *탐지* 규칙이라 "우연히 로케일로 보이는
 * 디렉터리인가"를 묻고, 여기는 "이 문자열을 경로에 넣어도 되는가"를 묻는다. 축이 다르고, 무엇보다
 * 그 함수는 `lib/adapters/**`에 있어 import하면 ARCHITECTURE §1.9 재측정 트리거가 붙는다.
 */
describe("isPathSafeLocale — 경로 조각으로 안전한 로케일 코드인가", () => {
  it("실제 로케일 코드를 통과시킨다", () => {
    for (const code of ["en", "ko", "pt-BR", "zh_Hans", "zh-Hant-TW", "fil", "es419"]) {
      expect(isPathSafeLocale(code)).toBe(true);
    }
  });

  it("경로를 벗어나는 문자를 거부한다 — `..`·슬래시·백슬래시", () => {
    for (const code of ["..", "../..", "a/b", "/etc", "a\\b", ".github", "."]) {
      expect(isPathSafeLocale(code)).toBe(false);
    }
  });

  it("발견 2의 실제 공격 문자열을 거부한다", () => {
    expect(isPathSafeLocale(".github/workflows/pwn")).toBe(false);
    expect(isPathSafeLocale("../../.github/workflows/pwn")).toBe(false);
  });

  it("퍼센트 인코딩·NUL·공백을 거부한다 — 우회 표기도 같은 답이어야 한다", () => {
    for (const code of ["%2e%2e", "%2F", "a\0b", "a b", "\t", "a\nb"]) {
      expect(isPathSafeLocale(code)).toBe(false);
    }
  });

  it("빈 문자열과 길이 초과를 거부한다", () => {
    expect(isPathSafeLocale("")).toBe(false);
    expect(isPathSafeLocale("a".repeat(35))).toBe(true);
    expect(isPathSafeLocale("a".repeat(36))).toBe(false);
  });
});

/**
 * **`pathTemplate`도 같은 부류다** — 페이로드가 정하고 그대로 경로가 된다. 다만 슬래시는 정당하므로
 * (`public/_locales/{locale}/messages.json`) 로케일과 규칙이 다르다: 막는 것은 **디렉터리를
 * 거슬러 오르는 것**이다.
 */
describe("isPathSafeRepoPath — 리포 안에 머무는 경로인가", () => {
  it("실제 템플릿과 치환 결과를 통과시킨다", () => {
    for (const p of [
      "i18n/{locale}.json",
      "public/_locales/{locale}/messages.json",
      "src/i18n/namespaces/*.ts",
      "config/locales/en.yml",
      "locales/ja.json",
    ]) {
      expect(isPathSafeRepoPath(p)).toBe(true);
    }
  });

  it("`..` 세그먼트를 거부한다 — 치환으로 만들어지는 것도 포함", () => {
    for (const p of ["../secrets", "a/../../b", "locales/../../.github/workflows/pwn", ".."]) {
      expect(isPathSafeRepoPath(p)).toBe(false);
    }
  });

  it("절대 경로·빈 세그먼트·끝 슬래시를 거부한다", () => {
    for (const p of ["/etc/passwd", "a//b", "a/", "./a", "a/."]) {
      expect(isPathSafeRepoPath(p)).toBe(false);
    }
  });

  it("NUL·백슬래시·빈 문자열·길이 초과를 거부한다", () => {
    expect(isPathSafeRepoPath("a\0b")).toBe(false);
    expect(isPathSafeRepoPath("a\\b")).toBe(false);
    expect(isPathSafeRepoPath("")).toBe(false);
    expect(isPathSafeRepoPath(`d/${"a".repeat(197)}`)).toBe(true);
    expect(isPathSafeRepoPath(`d/${"a".repeat(199)}`)).toBe(false);
  });
});
