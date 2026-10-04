import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionRead } from "@/lib/auth/read-session";
import type { Messages } from "@/lib/i18n";
import { UI_LOCALES } from "@/lib/i18n/locales";
import { en } from "@/messages/en";

/**
 * 요청의 화면 언어 (ui-locales tasks D2) — 계정 > 기기 쿠키 > en. `next/headers`와 `readSession`만 바꿔 끼운다.
 * React `cache`는 노드 테스트에서 기억 없이 통과하므로(`read-session.test.ts` 머리 주석) 판정만 잰다.
 */
const h = vi.hoisted(() => ({ session: { status: "none" } as SessionRead, cookie: undefined as string | undefined }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => h.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "malmoi-ui-locale" && h.cookie !== undefined ? { name, value: h.cookie } : undefined) }),
}));

const { getMessages, getUiLocale } = await import("../server");
const ok = (uiLocale: string | null): SessionRead => ({ status: "ok", userId: "u1", name: null, email: null, image: null, uiLocale });

beforeEach(() => {
  h.session = { status: "none" };
  h.cookie = undefined;
});

describe("getUiLocale", () => {
  it.each([
    ["계정이 쿠키를 이긴다", ok("es"), "ko", "es"],
    ["계정 값이 없으면 쿠키", ok(null), "ko", "ko"],
    ["계정 값이 지원 밖이면 쿠키", ok("fr"), "es", "es"],
    ["비로그인은 쿠키", { status: "none" } as SessionRead, "es", "es"],
    ["세션을 못 읽으면 쿠키 — 거부가 아니다", { status: "unavailable" } as SessionRead, "ko", "ko"],
    ["세션을 못 읽고 쿠키도 없으면 en", { status: "unavailable" } as SessionRead, undefined, "en"],
    ["쿠키가 깨졌으면 en", { status: "none" } as SessionRead, "__proto__", "en"],
  ] as const)("%s", async (_, session, cookie, expected) => {
    h.session = session;
    h.cookie = cookie;
    expect(await getUiLocale()).toBe(expected);
  });
});

describe("getMessages", () => {
  it("en 화면은 en 사전이다", async () => {
    expect(await getMessages()).toBe(en);
  });

  /**
   * 🟡1(R1) — **배선**을 잰다: `DICTIONARIES`의 그 줄이 그 언어 파일의 export가 아니면 red다. 대상은 `UI_LOCALES` 전부다.
   */
  it.each(UI_LOCALES)("%s 화면은 그 언어의 사전이다", async (uiLocale) => {
    h.cookie = uiLocale;
    const want = uiLocale === "en" ? en : ((await import(join(process.cwd(), "messages", `${uiLocale}.tsx`))) as Record<string, Messages>)[uiLocale];
    expect(await getMessages()).toBe(want);
  });
});

/** ⚪1(R1) — 요청당 한 번(React `cache`)과 "Accept-Language를 보지 않는다"(헤더를 읽지 않는다)를 소스로 고정한다. */
it("getUiLocale은 cache로 감싸고 요청 헤더를 읽지 않는다", () => {
  const src = readFileSync("lib/i18n/server.ts", "utf8");
  expect(src).toContain("cache(");
  // `next/headers`에서는 `cookies`만 가져온다 — `headers()`(Accept-Language)를 부르는 우회를 막는다.
  expect(src).toContain('import { cookies } from "next/headers";');
  expect(src).not.toMatch(/\bheaders\s*\(/);
});
