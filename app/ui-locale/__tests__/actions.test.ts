import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI_LOCALE_COOKIE } from "@/lib/i18n/locales";

import { setUiLocale } from "../actions";

/**
 * 화면 언어 바꾸기 (ui-locales design §4 · tasks F1).
 *
 * ⚠️ **계정 → 쿠키 순이고, 계정이 실패하면 쿠키도 안 쓴다** — 쿠키만 쓰면 다음 렌더에서 계정의 옛 값이 쿠키를 이겨
 * 화면이 조용히 되돌아간다. 그래서 갈래는 `ok`·`invalid`·`failed` 셋이고 "이 기기에만 적용됐다"는 갈래가 없다.
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
const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  mocks.forwardedProto = "https";
  update = vi.fn(async () => { order.push("account"); return {}; });
  mocks.getPrisma.mockReturnValue({ user: { update } });
  mocks.set.mockImplementation(() => { order.push("cookie"); });
  mocks.revalidatePath.mockImplementation(() => { order.push("revalidate"); });
  mocks.readSession.mockResolvedValue({ status: "none" });
});
afterEach(() => { vi.restoreAllMocks(); });

const signedIn = () => mocks.readSession.mockResolvedValue({ status: "ok", userId: "u1", name: null, email: null, image: null, uiLocale: "en" });

describe("setUiLocale", () => {
  it.each(["fr", "", "__proto__", "constructor", "EN", 1, null, undefined])("지원 밖의 값(%s)이면 아무것도 쓰지 않는다", async (raw) => {
    signedIn();
    expect(await setUiLocale(raw)).toBe("invalid");
    expect(mocks.readSession).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("비로그인이면 쿠키만 쓴다", async () => {
    expect(await setUiLocale("ko")).toBe("ok");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(order).toEqual(["cookie", "revalidate"]);
  });

  it("로그인이면 세션의 userId로 계정을 먼저 쓰고 쿠키를 쓴다 — 입력이 대상을 정하지 않는다", async () => {
    signedIn();
    expect(await setUiLocale("es")).toBe("ok");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { uiLocale: "es" } });
    expect(order).toEqual(["account", "cookie", "revalidate"]);
  });

  it("세션을 못 읽으면(unavailable) 아무것도 쓰지 않는다 — 쿠키만 쓰면 세션이 살아날 때 계정 값이 이긴다", async () => {
    mocks.readSession.mockResolvedValue({ status: "unavailable" });
    expect(await setUiLocale("ko")).toBe("failed");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["행 없음", Object.assign(new Error("Record to update not found."), { code: "P2025" })],
    ["DB 오류", new Error("db down")],
  ])("계정 갱신이 실패하면(%s) 쿠키도 쓰지 않는다", async (_case, error) => {
    signedIn();
    update.mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setUiLocale("ko")).toBe("failed");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("성공하면 루트 레이아웃을 무효화한다 — 루트 레이아웃이 언어를 읽으므로 전 화면이다", async () => {
    await setUiLocale("ko");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("무효화가 던져도 저장된 결과를 실패로 뒤집지 않는다", async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error("cache down"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setUiLocale("ko")).toBe("ok");
  });

  it("쿠키는 http-only · SameSite=Lax · Path=/ · 1년이고 https면 Secure다", async () => {
    await setUiLocale("ko");
    expect(mocks.set).toHaveBeenCalledWith(UI_LOCALE_COOKIE, "ko", {
      httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  });

  it.each([["http", false], [null, false], ["https,http", true], ["http,https", false]])("x-forwarded-proto %s → Secure %s", async (proto, secure) => {
    mocks.forwardedProto = proto;
    await setUiLocale("es");
    expect(mocks.set.mock.calls[0]?.[2]).toMatchObject({ secure });
  });
});
