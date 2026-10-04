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

it("레이아웃이 그 언어의 사전으로 provider 하나를 렌더한다", () => {
  expect(src).toContain("<MessagesProvider uiLocale={uiLocale} messages={UI_DICTIONARIES[uiLocale]}>");
  expect(src).toContain("</MessagesProvider>");
});
