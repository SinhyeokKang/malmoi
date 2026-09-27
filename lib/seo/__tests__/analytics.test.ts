import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { redactAnalyticsEvent } from "../analytics";

/**
 * **Analytics 허용 목록** (seo-geo T5 · spec D3·D10). 스크립트가 루트 레이아웃에 있어 앱 화면에서도 로드되므로 이것이 **유일한 거름망**이다 —
 * 차단 목록이 아니라 허용 목록이어야 하는 이유다.
 */
const ORIGIN = "https://dev.mal-moi.com";
const view = (path: string) => ({ type: "pageview" as const, url: `${ORIGIN}${path}` });

describe("redactAnalyticsEvent — 거른다", () => {
  it.each([
    "/invite/abc",
    "/signin/link/x",
    "/projects/p?q=secret",
    "/account",
    "/docsx",
    "/privacyx",
    "/Docs",
    "/docs/",
    "/privacy/",
    "/docs/..%2Finvite%2Ftok",
    "/docs/a_b",
    "/signin/",
  ])("%s → null", (path) => {
    expect(redactAnalyticsEvent(view(path))).toBeNull();
  });

  it("URL이 아니면 null", () => {
    expect(redactAnalyticsEvent({ type: "pageview", url: "not a url" })).toBeNull();
  });
});

describe("redactAnalyticsEvent — 통과시키되 쿼리·해시를 벗긴다", () => {
  it.each([
    ["/docs/setup?utm=1#a", `${ORIGIN}/docs/setup`],
    ["/?q=x", `${ORIGIN}/`],
    ["/signin?error=x", `${ORIGIN}/signin`],
    ["/docs", `${ORIGIN}/docs`],
    ["/docs/setup/create-project", `${ORIGIN}/docs/setup/create-project`],
    ["/privacy#cookies", `${ORIGIN}/privacy`],
  ])("%s → %s (origin 유지)", (path, expected) => {
    expect(redactAnalyticsEvent(view(path))).toEqual({ type: "pageview", url: expected });
  });

  it("커스텀 이벤트도 같은 규칙이다", () => {
    expect(redactAnalyticsEvent({ type: "event", url: `${ORIGIN}/docs?x=1` })).toEqual({ type: "event", url: `${ORIGIN}/docs` });
    expect(redactAnalyticsEvent({ type: "event", url: `${ORIGIN}/invite/t` })).toBeNull();
  });
});

describe("잎 모듈", () => {
  it("값 import가 0개다 — 클라이언트 그래프에 들어간다", () => {
    const source = readFileSync(fileURLToPath(new URL("../analytics.ts", import.meta.url)), "utf8");
    const imports = source.match(/^import\s.*$/gm) ?? [];
    expect(imports.every((line) => line.startsWith("import type "))).toBe(true);
  });
});
