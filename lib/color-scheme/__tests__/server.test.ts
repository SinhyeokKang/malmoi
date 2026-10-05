import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionRead } from "@/lib/auth/read-session";

/**
 * 요청의 화면 테마 (color-scheme design §3.4) — 계정 > 기기 쿠키 > light. `next/headers`와 `readSession`만 바꿔 끼운다.
 * React `cache`는 노드 테스트에서 기억 없이 통과하므로(`read-session.test.ts` 머리 주석) 판정만 잰다.
 */
const h = vi.hoisted(() => ({ session: { status: "none" } as SessionRead, cookie: undefined as string | undefined }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => h.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "malmoi-color-scheme" && h.cookie !== undefined ? { name, value: h.cookie } : undefined) }),
}));

const { getColorScheme } = await import("../server");
const ok = (colorScheme: string | null): SessionRead => ({ status: "ok", userId: "u1", name: null, email: null, image: null, uiLocale: null, timeZone: null, colorScheme });

beforeEach(() => {
  h.session = { status: "none" };
  h.cookie = undefined;
});

describe("getColorScheme", () => {
  it.each([
    ["계정이 쿠키를 이긴다", ok("dark"), "light", "dark"],
    ["계정 값이 없으면 쿠키", ok(null), "system", "system"],
    ["계정 값이 지원 밖이면 쿠키", ok("sepia"), "dark", "dark"],
    ["비로그인은 쿠키 — 로그아웃 뒤 공개 페이지", { status: "none" } as SessionRead, "dark", "dark"],
    ["세션을 못 읽으면 쿠키 — 거부가 아니다", { status: "unavailable" } as SessionRead, "system", "system"],
    ["세션을 못 읽고 쿠키도 없으면 light", { status: "unavailable" } as SessionRead, undefined, "light"],
    ["쿠키가 깨졌으면 light", { status: "none" } as SessionRead, "__proto__", "light"],
  ] as const)("%s", async (_, session, cookie, expected) => {
    h.session = session;
    h.cookie = cookie;
    expect(await getColorScheme()).toBe(expected);
  });
});
