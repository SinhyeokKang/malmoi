import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COLOR_SCHEME_COOKIE } from "@/lib/color-scheme/scheme";

import { setColorScheme } from "../actions";

/**
 * 화면 테마 바꾸기 (color-scheme design §3.6) — 공개 푸터(비로그인 포함)와 `/preferences`가 같이 부른다(`setUiLocale`과 같은 형).
 */
const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  getPrisma: vi.fn(),
  revalidatePath: vi.fn(),
  set: vi.fn(),
  forwardedProto: "https" as string | null,
}));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set }),
  headers: async () => new Headers(mocks.forwardedProto === null ? {} : { "x-forwarded-proto": mocks.forwardedProto }),
}));

let update: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forwardedProto = "https";
  update = vi.fn(async () => ({}));
  mocks.getPrisma.mockReturnValue({ user: { update } });
  mocks.readSession.mockResolvedValue({ status: "ok", userId: "u1", name: null, email: null, image: null, uiLocale: "en", timeZone: null, colorScheme: null });
});
afterEach(() => { vi.restoreAllMocks(); });

/**
 * ⚠️ **계정 → 쿠키 → 무효화 순이고, 계정이 실패하면 쿠키도 안 쓴다**(`setUiLocale`과 같은 형) — 쿠키만 쓰면 다음 렌더에서 계정의 옛 값이
 * 쿠키를 이겨(`resolveColorScheme`) 화면이 조용히 되돌아간다. 비로그인은 쿠키만, 세션을 못 읽으면 `failed`다(redirect하지 않는다).
 */
describe("setColorScheme", () => {
  const order: string[] = [];
  beforeEach(() => {
    order.length = 0;
    update.mockImplementation(async () => { order.push("account"); return {}; });
    mocks.set.mockImplementation(() => { order.push("cookie"); });
    mocks.revalidatePath.mockImplementation(() => { order.push("revalidate"); });
  });

  it.each(["sepia", "", "__proto__", "constructor", "toString", "Dark", " dark", 1, null, undefined])(
    "지원 밖의 값(%s)이면 세션도 읽지 않고 아무것도 쓰지 않는다",
    async (raw) => {
      expect(await setColorScheme(raw)).toBe("invalid");
      expect(mocks.readSession).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(mocks.set).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("비로그인이면 계정 없이 쿠키만 쓰고 무효화한다 — 공개 푸터의 정상 진입이다", async () => {
    mocks.readSession.mockResolvedValue({ status: "none" });
    expect(await setColorScheme("dark")).toBe("ok");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.set.mock.calls[0]?.[1]).toBe("dark");
    expect(order).toEqual(["cookie", "revalidate"]);
  });

  it("세션을 못 읽으면(unavailable) 아무것도 쓰지 않고 failed다 — 쿠키만 쓰면 세션이 살아날 때 계정의 옛 값이 이긴다", async () => {
    mocks.readSession.mockResolvedValue({ status: "unavailable" });
    expect(await setColorScheme("dark")).toBe("failed");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("세션의 userId로 계정을 먼저 쓰고 쿠키를 쓴 뒤 무효화한다 — 입력이 대상을 정하지 않는다", async () => {
    expect(await setColorScheme("dark")).toBe("ok");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { colorScheme: "dark" } });
    expect(order).toEqual(["account", "cookie", "revalidate"]);
  });

  it("System을 고르면 null이 아니라 \"system\"을 저장한다 — 쿠키보다 이겨야 다른 기기의 선택이 덮지 않는다", async () => {
    expect(await setColorScheme("system")).toBe("ok");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { colorScheme: "system" } });
    expect(mocks.set.mock.calls[0]?.[1]).toBe("system");
  });

  it.each([
    ["행 없음", Object.assign(new Error("Record to update not found."), { code: "P2025" })],
    ["DB 오류", new Error("db down")],
  ])("계정 갱신이 실패하면(%s) 쿠키도 쓰지 않고 failed다", async (_case, error) => {
    update.mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setColorScheme("dark")).toBe("failed");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("루트 레이아웃을 무효화한다 — `<html data-theme>`을 루트 레이아웃이 단다", async () => {
    await setColorScheme("light");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("무효화가 던져도 저장된 결과를 실패로 뒤집지 않는다", async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error("cache down"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setColorScheme("dark")).toBe("ok");
    expect(mocks.set).toHaveBeenCalled();
  });

  it("쿠키는 http-only · SameSite=Lax · Path=/ · 1년이고 https면 Secure다", async () => {
    await setColorScheme("dark");
    expect(mocks.set).toHaveBeenCalledWith(COLOR_SCHEME_COOKIE, "dark", {
      httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  });

  it.each([["http", false], [null, false], ["https,http", true], [" HTTPS , http", true], ["http,https", false]])(
    "x-forwarded-proto %s → Secure %s — 첫 항목만 본다",
    async (proto, secure) => {
      mocks.forwardedProto = proto;
      await setColorScheme("light");
      expect(mocks.set.mock.calls[0]?.[2]).toMatchObject({ secure });
    },
  );
});
