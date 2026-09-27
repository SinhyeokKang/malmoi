import { describe, expect, it } from "vitest";

import { looksLikeLocale } from "@/lib/adapters/shared";

import { isLocaleShaped, isPathSafeLocale, isPathSafeRepoPath } from "../locale-code";

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

/**
 * **로케일처럼 생겼는가** (sec-audit-3 발견 1b). `isPathSafeLocale`은 "경로에 넣어도 되나"만 보므로
 * `package`가 통과했고, `{locale}.json` 템플릿과 만나면 설치 토큰이 **리포에 실재하는** `package.json`을
 * 재생성했다. 축이 달라 함수를 합치지 않는다 — 두 경계(push 스키마·`resolveLocalePaths`)가 둘 다 요구한다.
 */
describe("isLocaleShaped — BCP 47·POSIX 모양의 로케일 코드인가", () => {
  it("실측 로케일을 통과시킨다", () => {
    for (const code of ["en", "ko", "EN", "pt_BR", "pt-BR", "zh-Hant-TW", "zh_Hans", "es-419", "sr-Latn", "fil", "en-GB-oxendict", "koKR", "enUS", "zhCN", "ptBR"]) {
      expect(isLocaleShaped(code)).toBe(true);
    }
  });

  it("리포에 흔한 파일명 단어를 거부한다", () => {
    for (const code of ["package", "index", "README", "config", "action", "tsconfig", "messages"]) {
      expect(isLocaleShaped(code)).toBe(false);
    }
  });

  it("첫 서브태그는 영문자 2~3자다", () => {
    for (const code of ["e", "abcd", "e1", "12", "419", "l0"]) {
      expect(isLocaleShaped(code)).toBe(false);
    }
  });

  it("빈 서브태그·9자 넘는 서브태그·끝 구분자를 거부한다", () => {
    for (const code of ["en--US", "en__US", "en-", "en_", "-en", "en-abcdefghi"]) {
      expect(isLocaleShaped(code)).toBe(false);
    }
    expect(isLocaleShaped("en-abcdefgh")).toBe(true);
  });

  it("경로·제어 문자와 길이 초과를 거부한다 — 단독으로도 안전하다", () => {
    for (const code of ["", "en/US", "en.US", "en\n", "en US", "../en", `en${"-abcdefgh".repeat(4)}`]) {
      expect(isLocaleShaped(code)).toBe(false);
    }
  });
});

/**
 * **탐지가 받는 이름은 적재도 받는다** (sec-audit-3 fix r1). `looksLikeLocale`이 로케일로 본 파일명이 `isLocaleShaped`에서
 * 떨어지면 온보딩이 탐지를 지나 첫 적재의 `PushPayload.safeParse`에서 엉뚱한 문구로 죽고, 저장된 행은 야간 pull을
 * `unknown`으로 멈춘다 — naive-ui의 `koKR`(2026-09-02)이 정확히 그 모양이었다.
 *
 * ⚠️ **손으로 고른 목록이 아니라 규칙에서 생성한다** — 지금 `looksLikeLocale`의 갈래(첫 서브태그 소문자 2~3자 ×
 * 없음|`[-_]`+2~4자 꼬리, camelCase `[a-z]{2}[A-Z]{2}`)를 경계 글자로 전수로 돌리고, 여기에 `a Z - _ 0`로 만든 **5자 이하
 * 문자열 전부**를 더한 뒤 `looksLikeLocale`이 받는 것만 남겨 포함 관계를 잰다.
 * ⚠️ **생성 공간이 그만큼이다** — 탐지 규칙이 넓어져도 새 모양이 이 생성기(현재 규칙의 꼬리 길이 이하 · 5자 이하 전수)
 * 안에 들지 않으면 여기서 red가 나지 않는다. 탐지 규칙을 넓히면 이 생성기도 같이 넓힌다.
 */
describe("isLocaleShaped ⊇ looksLikeLocale — 탐지가 받는 이름을 적재가 거부하지 않는다", () => {
  const product = (alphabet: readonly string[], length: number): string[] =>
    length === 0 ? [""] : product(alphabet, length - 1).flatMap((head) => alphabet.map((c) => head + c));
  const LOWER = ["a", "m", "z"];
  const ANY_CASE = ["a", "z", "A", "Z"];
  const UPPER = ["A", "Z"];

  const generated = new Set<string>();
  // 첫 서브태그 [a-z]{2,3} × (없음 | [-_] + [A-Za-z]{2,4})
  for (const firstLength of [2, 3]) {
    for (const first of product(LOWER, firstLength)) {
      generated.add(first);
      for (const sep of ["-", "_"]) {
        for (const tailLength of [2, 3, 4]) for (const tail of product(ANY_CASE, tailLength)) generated.add(first + sep + tail);
      }
    }
  }
  // camelCase [a-z]{2}[A-Z]{2}
  for (const first of product(LOWER, 2)) for (const tail of product(UPPER, 2)) generated.add(first + tail);
  // 규칙 밖을 섞어 두 방향의 경계를 한 번 더 훑는다 — 짧은 문자열 전수.
  for (let length = 1; length <= 5; length++) for (const s of product(["a", "Z", "-", "_", "0"], length)) generated.add(s);

  const accepted = [...generated].filter(looksLikeLocale);

  it("생성 공간이 규칙의 모든 갈래를 밟는다 — 공허한 검사가 아니다", () => {
    expect(accepted).toContain("amAZ");
    expect(accepted.some((n) => /^[a-z]{2}[A-Z]{2}$/.test(n))).toBe(true);
    expect(accepted.some((n) => /^[a-z]{3}_[A-Za-z]{4}$/.test(n))).toBe(true);
    expect(accepted.length).toBeGreaterThan(1_000);
  });

  it("탐지가 받는 이름은 전부 로케일 모양이다", () => {
    expect(accepted.filter((n) => !isLocaleShaped(n))).toEqual([]);
  });
});
