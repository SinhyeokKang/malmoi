import { describe, expect, it, vi } from "vitest";

import { lockCredential } from "../lock";

/**
 * **잠금 뒤 자격증명 재읽기의 분기** (mcp-oauth design §5). 개인 토큰은 `userId` AND `tokenHash`로 다시 읽는다 — 해시가 빠지면
 * 재발급된 새 토큰의 권한으로 옛 토큰의 쓰기가 통과한다. OAuth 연결 재읽기는 T5에서 붙고, 그 전엔 DB를 읽지 않고 거부한다.
 */
function txWith(row: unknown) {
  const findFirst = vi.fn().mockResolvedValue(row);
  return { tx: { apiToken: { findFirst } } as never, findFirst };
}

const live = { grants: ["translation:write"], allProjects: true, projectIds: [], expiresAt: new Date(Date.now() + 86_400_000) };

describe("lockCredential", () => {
  it("세션 주체(credential 없음)는 읽지 않고 통과한다", async () => {
    const { tx, findFirst } = txWith(null);
    expect(await lockCredential(tx, { credential: undefined, userId: "u1", projectId: "p", grant: "translation:write" })).toEqual({ status: "ok", grant: "ok" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("개인 토큰은 userId와 tokenHash를 함께 조건으로 다시 읽는다", async () => {
    const { tx, findFirst } = txWith(live);
    const credential = { kind: "api-token" as const, tokenHash: "h1" };
    expect(await lockCredential(tx, { credential, userId: "u1", projectId: "p", grant: "translation:write" })).toEqual({ status: "ok", grant: "ok" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", tokenHash: "h1" } }));
  });

  it("개인 토큰 행이 없으면(폐기·재발급) unauthorized", async () => {
    const { tx } = txWith(null);
    expect(await lockCredential(tx, { credential: { kind: "api-token", tokenHash: "old" }, userId: "u1", projectId: "p", grant: "translation:write" }))
      .toEqual({ status: "unauthorized" });
  });

  it("OAuth 연결은 아직 재읽기가 없어 DB를 읽지 않고 unauthorized", async () => {
    const { tx, findFirst } = txWith(live);
    expect(await lockCredential(tx, { credential: { kind: "oauth", connectionId: "c1" }, userId: "u1", projectId: "p", grant: "translation:write" }))
      .toEqual({ status: "unauthorized" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
