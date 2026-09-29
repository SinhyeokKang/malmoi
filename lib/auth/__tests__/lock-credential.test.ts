import { describe, expect, it, vi } from "vitest";

import { lockCredential } from "../lock";

/**
 * **잠금 뒤 자격증명 재읽기의 분기** (mcp-oauth design §5). 개인 토큰은 `userId` AND `tokenHash`로 다시 읽는다 — 해시가 빠지면
 * 재발급된 새 토큰의 권한으로 옛 토큰의 쓰기가 통과한다. OAuth는 `userId` AND 연결 id로 다시 읽는다 — access 해시가 아니다(대기 중
 * refresh가 access를 회전해도 같은 연결의 쓰기는 정당하다). 두 행이 **같은 `planLockedToken`**을 지난다.
 */
function txWith(row: unknown) {
  const findFirst = vi.fn().mockResolvedValue(row);
  const connection = vi.fn().mockResolvedValue(row);
  return { tx: { apiToken: { findFirst }, oAuthConnection: { findFirst: connection } } as never, findFirst, connection };
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

  it("OAuth 연결은 userId와 연결 id를 함께 조건으로 다시 읽고 개인 토큰과 같은 판정을 받는다", async () => {
    const { tx, findFirst, connection } = txWith(live);
    const credential = { kind: "oauth" as const, connectionId: "c1" };
    expect(await lockCredential(tx, { credential, userId: "u1", projectId: "p", grant: "translation:write" })).toEqual({ status: "ok", grant: "ok" });
    expect(connection).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", id: "c1" } }));
    expect(findFirst).not.toHaveBeenCalled();
    expect(await lockCredential(tx, { credential, userId: "u1", projectId: "p", grant: "member:manage" })).toEqual({ status: "ok", grant: "token-scope" });
  });

  it("OAuth 연결 행이 없으면(끊김·재동의·재사용 폐기) unauthorized · 만료도 같다", async () => {
    expect(await lockCredential(txWith(null).tx, { credential: { kind: "oauth", connectionId: "c1" }, userId: "u1", projectId: "p", grant: "translation:write" }))
      .toEqual({ status: "unauthorized" });
    const expired = { ...live, expiresAt: new Date(Date.now() - 1) };
    expect(await lockCredential(txWith(expired).tx, { credential: { kind: "oauth", connectionId: "c1" }, userId: "u1", projectId: "p", grant: "translation:write" }))
      .toEqual({ status: "unauthorized" });
  });

  it("OAuth 고른 범위 밖 프로젝트는 not-found", async () => {
    const scoped = { ...live, allProjects: false, projectIds: ["other"] };
    expect(await lockCredential(txWith(scoped).tx, { credential: { kind: "oauth", connectionId: "c1" }, userId: "u1", projectId: "p", grant: "translation:write" }))
      .toEqual({ status: "not-found" });
  });
});
