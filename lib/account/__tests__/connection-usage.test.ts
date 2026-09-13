import { afterEach, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { loadConnectionUsage } from "../connection-usage";

afterEach(() => vi.restoreAllMocks());

function db(count: ReturnType<typeof vi.fn>) {
  return { project: { count } } as unknown as PrismaClient;
}

/**
 * `N projects use this connection.` — GitHub 연결 해제 Dialog의 논거 (태스크 6).
 *
 * ⚠️ **0과 실패를 같은 값으로 접지 않는다** — 0은 "어느 프로젝트도 이 연결을 쓰지 않는다"이고
 * 숨길 이유가 없는 정보다. 실패만 `null`이고 그때 그 줄이 화면에서 사라진다.
 */
it("0을 그대로 돌려준다 — 실패와 같은 값으로 접지 않는다", async () => {
  expect(await loadConnectionUsage(db(vi.fn().mockResolvedValue(0)), "u1")).toBe(0);
});

it("세어진 수를 그대로 돌려준다", async () => {
  expect(await loadConnectionUsage(db(vi.fn().mockResolvedValue(3)), "u1")).toBe(3);
});

/**
 * ⚠️ **이 축의 소유자는 `User`다** — `projectId`가 아니라 `userId`로 좁힌다. 안 좁히면 남의
 * 프로젝트까지 세어 Dialog가 거짓을 말한다 (POSTMORTEM 2026-09-06).
 *
 * 세는 기준은 **내가 OWNER이고 보관되지 않은 프로젝트**다 — 발송이 실제로 멈추는 대상이 그것이다.
 */
it("내가 OWNER인 보관되지 않은 프로젝트만 센다", async () => {
  const count = vi.fn().mockResolvedValue(1);
  await loadConnectionUsage(db(count), "u1");
  expect(count.mock.calls[0]![0]).toEqual({
    where: { archivedAt: null, members: { some: { userId: "u1", role: "OWNER" } } },
  });
});

/**
 * ⚠️ **화면에서 무음이므로 서버 로그에 남긴다** — 남기지 않으면 "0이라 안 보인다"와 "죽어서 안
 * 보인다"를 나중에 구별할 흔적이 없다.
 */
it("조회 실패는 null이고 서버 로그에 남는다", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await loadConnectionUsage(db(vi.fn().mockRejectedValue(new Error("db down"))), "u1")).toBeNull();
  expect(error).toHaveBeenCalled();
  // 사유 문자열에 사용자 식별자 말고 다른 것이 섞이지 않는다 — 로그가 PII를 나르지 않는다.
  expect(JSON.stringify(error.mock.calls[0])).not.toContain("db down");
});
