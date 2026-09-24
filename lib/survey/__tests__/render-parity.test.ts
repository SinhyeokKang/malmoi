import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **측정 층은 pull과 같은 렌더를 지난다** (audit #54 — POSTMORTEM 2026-09-02 "지표와 프로덕션이 다른 입력으로 write를
 * 부른다"). `lib/survey/one.ts`가 `renderLocaleFiles`를 재구현한 `writePerLocale`·`writeMultiLocale`을 들고 있었고, 셋이
 * 갈렸다 — multi-locale 로케일 목록(read가 본 것 vs `format.locales`), 원본 없는 수술적 파일의 보고, 편집 탐침의 비-base 입력.
 * 두 벌이면 다시 갈린다 — 어댑터 write 호출이 `one.ts`에 없어야 한다.
 */
const source = readFileSync("lib/survey/one.ts", "utf8");

it("one.ts가 어댑터 write를 직접 부르지 않고 renderLocaleFiles를 쓴다", () => {
  expect(source).toMatch(/import \{[^}]*\brenderLocaleFiles\b[^}]*\} from "\.\.\/pull\/render"/);
  expect(source.match(/\.writeWithErrors\b|\.write\(/g) ?? []).toEqual([]);
});
