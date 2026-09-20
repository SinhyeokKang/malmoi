import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { decodeUser } from "@/lib/credentials/records";
import { NAME_MAX_CHARS } from "@/lib/account/plan";

import { updateProfileName } from "../actions";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), revalidatePath: vi.fn(), getPrisma: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

let update: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "owner", ...data }));
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.getPrisma.mockReturnValue({ user: { update } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each(["signin", "unavailable"])("인증 실패 %s는 저장 전에 끝난다", async (reason) => {
  mocks.requireUser.mockRejectedValue(new Error(reason));
  await expect(updateProfileName("Jane")).rejects.toThrow(reason);
  expect(mocks.getPrisma).not.toHaveBeenCalled();
});

/** 거부가 **값**이다 — 던지면 사유가 `unavailable`로 뭉개져 화면이 무엇을 고치라고 못 말한다. */
it("빈 이름과 상한 초과는 DB에 닿기 전에 값으로 거부한다", async () => {
  expect(await updateProfileName("   ")).toEqual({ ok: false, reason: "empty" });
  expect(await updateProfileName("a".repeat(NAME_MAX_CHARS + 1))).toEqual({ ok: false, reason: "too-long" });
  expect(update).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

/**
 * ⚠️⚠️ **이 단언이 이 파일의 존재 이유다.** `encodeUserFields`를 빼고 `{ name }`을 직접 쓰면
 * `typecheck`도 나머지 테스트 전부도 green인 채 평문이 저장되고, **다음 `decodeUser`가
 * `CredentialError`로 죽어 그 사람의 로그인·멤버 조회가 통째로 막힌다.** `prisma/schema.prisma`가
 * 2026-09-13까지 그 사실을 말하지 않아 스키마만 읽고 구현하면 틀리는 자리였다.
 */
it("트림한 이름을 봉투로 저장하고 다시 열어 같은 값을 낸다", async () => {
  // ⚠️ **저장된 값을 돌려준다** — 화면이 자기 입력으로 성공을 판정하면 트림된 경우가 무음이 된다.
  expect(await updateProfileName("  Jane Doe  ")).toEqual({ ok: true, name: "Jane Doe" });
  const written = update.mock.calls[0]![0] as { where: { id: string }; data: { name: string } };
  // 세션이 정한 주체로만 쓴다 — 인자로 온 값이 대상을 정하지 않는다.
  expect(written.where).toEqual({ id: "owner" });
  expect(written.data.name).toMatch(/^enc:v1:/);
  expect(decodeUser({ id: "owner", name: written.data.name }).name).toBe("Jane Doe");
});

/**
 * ⚠️ **접두로 화면 집합을 표현하지 않는다** (POSTMORTEM 2026-09-09). 셸 아바타·사용자 메뉴가 같은
 * 값을 읽으므로 `/account`만 무효화하면 헤더가 옛 이름을 계속 말한다. 문자열이라 컴파일러가
 * 못 보고, 틀리면 조용하다.
 */
it("셸까지 덮는 루트 레이아웃을 무효화한다", async () => {
  await updateProfileName("Jane");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("저장 실패는 값으로 돌아오고 무효화하지 않는다", async () => {
  update.mockRejectedValue(new Error("db down"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await updateProfileName("Jane")).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  // 로그가 PII도 드라이버 원문도 나르지 않는다 — 봉투가 무의미해지고 인자가 새어 나온다.
  expect(JSON.stringify(error.mock.calls[0])).not.toContain("db down");
  expect(JSON.stringify(error.mock.calls[0])).not.toContain("Jane");
});

/** ⚠️ **활성 쓰기 키가 없으면 쓰기 전에 멈춘다** (POSTMORTEM 2026-09-13 — 같은 축의 순서 규칙). */
it("활성 쓰기 키가 없으면 DB에 닿지 않는다", async () => {
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "missing");
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await updateProfileName("Jane")).toEqual({ ok: false, reason: "unavailable" });
  expect(update).not.toHaveBeenCalled();
});

/** 이름도 같다 — 커밋 뒤 캐시 실패가 저장된 이름을 "실패"로 만들지 않는다 (POSTMORTEM 2026-09-20 🔁). */
it("커밋 뒤 캐시 실패를 저장 실패로 보고하지 않는다", async () => {
  mocks.revalidatePath.mockImplementationOnce(() => { throw new Error("cache failure"); });
  expect(await updateProfileName("Jane")).toEqual({ ok: true, name: "Jane" });
  expect(update).toHaveBeenCalledTimes(1);
});
