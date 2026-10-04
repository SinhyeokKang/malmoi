import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTimeZone } from "../actions";

/**
 * 시간대 바꾸기 (user-timezone design §6.1 · tasks D1).
 *
 * ⚠️ **계정 하나에만 쓴다** — 쿠키 층이 없다(spec 결정). 그래서 세션이 `ok`가 아니면 쓸 곳이 없어 `failed`다.
 * ⚠️ **성공 갈래에서만 무효화한다** — 실패 뒤 무효화는 바뀌지 않은 화면을 다시 그릴 뿐이다.
 */
const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getPrisma: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

let update: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  update = vi.fn(async () => ({}));
  mocks.getPrisma.mockReturnValue({ user: { update } });
  mocks.readSession.mockResolvedValue({ status: "ok", userId: "u1", name: null, email: null, image: null, uiLocale: "en", timeZone: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("setTimeZone", () => {
  it.each(["Mars/Base", "", "__proto__", "constructor", "toString", "asia/seoul", "Asia/Seoul ", 9, null, undefined])(
    "목록 밖의 값(%s)이면 세션도 읽지 않고 아무것도 쓰지 않는다",
    async (raw) => {
      expect(await setTimeZone(raw)).toBe("invalid");
      expect(mocks.readSession).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(["none", "unavailable"])("세션이 %s면 쓰지 않고 failed다 — 쿠키 층이 없어 쓸 곳이 없다", async (status) => {
    mocks.readSession.mockResolvedValue({ status });
    expect(await setTimeZone("Asia/Seoul")).toBe("failed");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("세션의 userId로 계정을 쓴다 — 입력이 대상을 정하지 않는다", async () => {
    expect(await setTimeZone("Asia/Seoul")).toBe("ok");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { timeZone: "Asia/Seoul" } });
  });

  it("UTC를 고르면 null이 아니라 \"UTC\"를 저장한다", async () => {
    expect(await setTimeZone("UTC")).toBe("ok");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { timeZone: "UTC" } });
  });

  it.each([
    ["행 없음", Object.assign(new Error("Record to update not found."), { code: "P2025" })],
    ["DB 오류", new Error("db down")],
  ])("계정 갱신이 실패하면(%s) failed이고 무효화하지 않는다", async (_case, error) => {
    update.mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setTimeZone("Asia/Seoul")).toBe("failed");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("성공하면 계정을 쓴 뒤 루트 레이아웃을 무효화한다 — 루트 레이아웃이 provider에 시간대를 싣는다", async () => {
    const order: string[] = [];
    update.mockImplementation(async () => { order.push("account"); return {}; });
    mocks.revalidatePath.mockImplementation(() => { order.push("revalidate"); });
    await setTimeZone("America/New_York");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(order).toEqual(["account", "revalidate"]);
  });

  it("무효화가 던져도 저장된 결과를 실패로 뒤집지 않는다", async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error("cache down"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setTimeZone("Asia/Seoul")).toBe("ok");
  });
});
