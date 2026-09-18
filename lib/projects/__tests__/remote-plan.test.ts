import { describe, expect, it } from "vitest";

import { changedLocaleFileCount } from "../remote-plan";

/**
 * **"base가 앞섰다"의 숫자는 키가 아니라 로케일 파일 수다**.
 * 서버는 리포를 체크아웃하지 않으므로 그 커밋의 키를 셀 수 없다 — compare가 주는 것은 경로뿐이고,
 * 그래서 화면도 파일 수를 말한다. **키 수를 지어내지 않는다.**
 *
 * ⚠️ **`resolveLocalePaths`를 필터로 쓰지 않는다** — 그 함수는 per-locale에서 입력 경로를 무시하고,
 * multi-locale에서 일치 0개를 오류로 보는 **export 계약**이다. 여기서 묻는 것은 "이 변경이 로케일
 * 파일을 건드렸나"이고 일치 0은 정상이다.
 */

const JSON_CATALOG = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", storedLocales: ["en", "ko"] };
const file = (filename: string, previous?: string) => ({ filename, ...(previous === undefined ? {} : { previous_filename: previous }) });

describe("changedLocaleFileCount — per-locale", () => {
  it("README만 바뀌면 0이다 — 띠를 만들지 않는다", () => {
    expect(changedLocaleFileCount(JSON_CATALOG, [file("README.md"), file("src/app.ts")])).toBe(0);
  });

  it("기존 로케일의 변경을 센다", () => {
    expect(changedLocaleFileCount(JSON_CATALOG, [file("i18n/ko.json")])).toBe(1);
  });

  /** 저장되지 않은 새 로케일도 탐지 규칙에 맞으면 포함한다 — 그것이 "새 언어가 생겼다"의 신호다. */
  it("새 로케일 파일이 추가되면 센다", () => {
    expect(changedLocaleFileCount(JSON_CATALOG, [file("i18n/fr.json")])).toBe(1);
  });

  it("삭제된 로케일도 센다 — 경로가 변경 목록에 있다는 사실은 같다", () => {
    expect(changedLocaleFileCount(JSON_CATALOG, [file("i18n/de.json")])).toBe(1);
  });

  /**
   * ⚠️ **저장 로케일은 탐지 정규식을 통과하지 못할 수 있다.** `looksLikeLocale`이
   * `es-419`의 숫자와 `zh-Hant-TW`의 길이를 거르므로, 그 둘은 **저장된 코드로 만든 정확한 경로**를
   * 따로 합쳐야 빠지지 않는다.
   */
  it.each([
    ["숫자가 든 코드", "es-419"],
    ["긴 코드", "zh-Hant-TW"],
  ])("%s의 저장 로케일 경로를 지킨다", (_label, code) => {
    const input = { ...JSON_CATALOG, storedLocales: ["en", code] };
    expect(changedLocaleFileCount(input, [file(`i18n/${code}.json`)])).toBe(1);
  });

  describe("rename", () => {
    /** 둘 중 하나가 매칭되면 **파일 레코드당 한 번**이다 — 두 번 세면 숫자가 부풀어 오른다. */
    it("로케일 자리 안에서의 이동을 한 번만 센다", () => {
      expect(changedLocaleFileCount(JSON_CATALOG, [file("i18n/ko.json", "i18n/kr.json")])).toBe(1);
    });

    it("로케일 자리로 들어온 파일을 센다", () => {
      expect(changedLocaleFileCount(JSON_CATALOG, [file("i18n/ko.json", "old/ko.json")])).toBe(1);
    });

    it("로케일 자리에서 나간 파일도 센다 — 그 로케일이 사라진 것이다", () => {
      expect(changedLocaleFileCount(JSON_CATALOG, [file("archive/ko.json", "i18n/ko.json")])).toBe(1);
    });

    it("둘 다 로케일 밖이면 0이다", () => {
      expect(changedLocaleFileCount(JSON_CATALOG, [file("docs/b.md", "docs/a.md")])).toBe(0);
    });
  });

  /** `{locale}`이 여럿이면 전부 같은 값이어야 한다 — `replaceAll`이 그렇게 만든다. */
  it("중복 `{locale}` 자리가 어긋나면 0이다", () => {
    const input = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}/{locale}.json", storedLocales: ["en"] };
    expect(changedLocaleFileCount(input, [file("i18n/ko/en.json")])).toBe(0);
    expect(changedLocaleFileCount(input, [file("i18n/en/en.json")])).toBe(1);
  });
});

describe("changedLocaleFileCount — multi-locale", () => {
  const TS_DICT = { adapter: "ts-dict" as const, pathTemplate: "src/i18n/*.ts", storedLocales: ["en", "ko"] };

  it("글롭에 맞는 파일을 센다", () => {
    expect(changedLocaleFileCount(TS_DICT, [file("src/i18n/messages.ts"), file("src/app.ts")])).toBe(1);
  });

  /** ⚠️ **일치 0은 정상 0이다** — `resolveLocalePaths`가 그것을 오류로 보는 것과 갈리는 지점이다. */
  it("일치가 0이어도 오류가 아니다", () => {
    expect(changedLocaleFileCount(TS_DICT, [file("README.md")])).toBe(0);
  });

  /** multi-locale은 저장 로케일로 경로를 만들지 않는다 — 파일 하나에 전 로케일이 들어 있다. */
  it("저장 로케일로 경로를 합치지 않는다", () => {
    expect(changedLocaleFileCount(TS_DICT, [file("src/i18n/ko.ts")])).toBe(1);
    expect(changedLocaleFileCount({ ...TS_DICT, pathTemplate: "locales/*.ts" }, [file("src/i18n/ko.ts")])).toBe(0);
  });
});

it("모르는 어댑터는 0이다 — 어느 파일도 가리키지 못한다", () => {
  expect(changedLocaleFileCount({ adapter: "nope" as never, pathTemplate: "i18n/{locale}.json", storedLocales: [] }, [file("i18n/ko.json")])).toBe(0);
});

it("변경 목록이 비면 0이다", () => {
  expect(changedLocaleFileCount(JSON_CATALOG, [])).toBe(0);
});
