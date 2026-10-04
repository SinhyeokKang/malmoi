import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

/**
 * **루트 레이아웃이 요청의 화면 언어를 `<html lang>`과 provider에 싣는다** (ui-locales tasks D3). async 서버 레이아웃은 jsdom으로 그릴 수
 * 없어 소스로 고정한다 — provider를 빠뜨리면 클라이언트 문구가 조용히 영어가 된다(`useMessages()`의 기본값).
 */
const src = readFileSync("app/layout.tsx", "utf8");

it("레이아웃이 getUiLocale을 읽어 <html lang>에 싣는다 — 영어 고정 리터럴이 없다", () => {
  expect(src).toContain("await getUiLocale()");
  expect(src).toContain("<html lang={uiLocale}");
  expect(src).not.toContain('lang="en"');
});

it("레이아웃이 언어 코드·시간대만 넘겨 provider 하나를 렌더한다 — 사전은 provider 안 로더가 읽는다", () => {
  // user-timezone C1 — 시간대를 빠뜨리면 클라이언트 날짜가 조용히 UTC다(`useDateStyle()`의 기본값).
  expect(src).toContain("await getDateStyle()");
  expect(src).toContain("<MessagesProvider uiLocale={uiLocale} timeZone={timeZone}>");
  expect(src).toContain("</MessagesProvider>");
});

/**
 * ⚠️ **번들 회귀 방어선** (orch D7) — 레이아웃(서버)이 import하는 client 모듈은 Turbopack이 전부 레이아웃 청크 그룹에 실어 en 사용자도 받는다.
 * 사전을 레이아웃 그래프로 끌어오는 import가 생기면 ko·es 사전이 모든 사용자에게 간다. 사전 import 자리 전체는 `dictionary-consistency.test.ts` ⑥이 센다.
 */
it("레이아웃이 사전 모듈을 import하지 않는다", () => {
  expect(src).not.toMatch(/["']@\/messages\/(?!en["'])/);
  expect(src).not.toMatch(/["']@\/components\/i18n\/(?!messages-provider["'])/);
});
