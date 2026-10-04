import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionRead } from "@/lib/auth/read-session";
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
});
