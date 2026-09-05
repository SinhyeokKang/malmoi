import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **Publish의 라이브러리 예외가 원문으로 편집자에게 가지 않는다** (Codex 감사 2026-09-06 #7).
 *
 * `/api/pull`은 `classifyFailure`로 우리 메시지와 남의 메시지를 갈라 후자는 `ref`만 내는데(ARCHITECTURE §6.0),
 * 같은 `triggerPull`을 부르는 Server Action은 `error.message`를 그대로 직렬화했다. 읽는 사람이 이번 단계부터
 * 외부 초대자다 — Prisma 접속 오류 한 줄이 pooler 호스트와 DB 유저를 담는다.
 *
 * 별도 파일인 이유: `triggerPull`을 통째로 mock해야 하고, `authorization.test.ts`는 그것을 실제로 지난다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  triggerPull: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));

const { triggerPullAction } = await import("../actions");

beforeEach(() => {
  const db = createHarness({
    members: [{ projectId: "p1", userId: "u-editor", role: "EDITOR" }],
    users: [{ id: "u-editor", email: "e@a.com" }],
  });
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-editor");
  hoisted.triggerPull.mockReset();
});

describe("triggerPullAction — 예외의 본문", () => {
  it("남의 라이브러리 오류는 원문이 아니라 ref만 나간다", async () => {
    const leak = new Error("connect ECONNREFUSED aws-0-ap-northeast-1.pooler.supabase.com:6543 user=postgres.abc");
    leak.name = "PrismaClientInitializationError";
    hoisted.triggerPull.mockRejectedValue(leak);

    const result = await triggerPullAction("acme");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("failed여야 한다");
    expect(result.error).not.toContain("pooler");
    expect(result.error).not.toContain("postgres.abc");
    expect(result.error).toMatch(/ref/);
  });

  it("우리 문구(AppError)는 그대로 나간다 — slug·경로 템플릿은 편집자가 이미 아는 값이다", async () => {
    const { fail } = await import("@/lib/failure");
    hoisted.triggerPull.mockImplementation(async () => fail("base 브랜치를 읽을 수 없다: dev"));

    const result = await triggerPullAction("acme");
    expect(result).toEqual({ status: "failed", error: "base 브랜치를 읽을 수 없다: dev" });
  });

  it("ref가 호출마다 달라 로그를 찾을 수 있다", async () => {
    hoisted.triggerPull.mockRejectedValue(new Error("x"));
    const a = await triggerPullAction("acme");
    const b = await triggerPullAction("acme");
    expect(a).not.toEqual(b);
  });
});
