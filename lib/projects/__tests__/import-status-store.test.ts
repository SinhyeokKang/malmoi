import { expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { finishImportRun, markImportStarted, recordReportedFailure } from "../import-status-store";

const startedAt = new Date("2026-09-13T00:00:00.000Z");
const commitAt = new Date("2026-09-13T01:00:00.000Z");

function fixture(count = 1) {
  const project = { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count }) };
  return { db: { translationSurface: project } as unknown as PrismaClient, project };
}

it("marks a run as started on the authorized project only", async () => {
  const { db, project } = fixture();
  await markImportStarted(db, { projectId: "p1", surfaceId: "s1" }, startedAt, "run-token");
  expect(project.update).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" }, data: { lastImportStartedAt: startedAt, lastImportToken: "run-token" } });
});

/**
 * ⚠️ **자기 시작 시각을 대조한다.** 대조 없이 비우면 나중 실행이 앞선 실행의 진행 표시를 치우고,
 * 화면은 아직 돌고 있는 적재를 "끝났는데 실패"로 그린다.
 */
it("clears only its own running marker when a run fails", async () => {
  const { db, project } = fixture();
  await finishImportRun(db, { projectId: "p1", surfaceId: "s1", token: "run-token", code: "import-failed" });
  expect(project.updateMany).toHaveBeenCalledWith({
    where: { id: "s1", projectId: "p1", lastImportToken: "run-token" },
    data: { lastImportStartedAt: null, lastImportToken: null, lastImportError: "import-failed" },
  });
});

/** 실패 기록이 실패해도 원래 오류를 덮지 않는다 — 호출부가 그 뒤에 던진다. */
it("swallows its own write failure", async () => {
  const { db, project } = fixture();
  project.updateMany.mockRejectedValue(new Error("connection lost"));
  await expect(finishImportRun(db, { projectId: "p1", surfaceId: "s1", token: "run-token", code: "import-failed" })).resolves.toBeUndefined();
});

/**
 * ⚠️ **선조회로 통과시키고 무조건 UPDATE하지 않는다** — 조회와 쓰기 사이에 성공한 push가 들어오면
 * 오래된 실패가 그것을 덮는다. 조건을 UPDATE에 싣고 갱신 건수로 판정한다.
 */
it("carries authentication, archive, and commit order into the update itself", async () => {
  const { db, project } = fixture();
  expect(await recordReportedFailure(db, { projectId: "p1", surfaceId: "s1", tokenHash: "h", commitAt, code: "parse-failed" })).toBe("recorded");
  expect(project.updateMany).toHaveBeenCalledWith({
    where: {
      id: "s1",
      projectId: "p1",
      project: { pushTokenHash: "h", archivedAt: null },
      archivedAt: null,
      OR: [{ lastCommitAt: null }, { lastCommitAt: { lte: commitAt } }],
    },
    data: { lastImportError: "parse-failed" },
  });
});

/**
 * ⚠️ **기준 커밋을 전진시키지 않는다.** 실패 보고는 아무것도 적재하지 않았으므로 `lastCommitSha`·
 * `lastCommitAt`이 움직이면 다음 정상 push가 자기 커밋으로 `stale-commit` 409를 받는다.
 * 진행 표시도 건드리지 않는다 — 서버가 돌린 적 없는 구간이라 지울 진행이 없다.
 */
it("touches neither the commit baseline nor another run's progress", async () => {
  const { db, project } = fixture();
  await recordReportedFailure(db, { projectId: "p1", surfaceId: "s1", tokenHash: "h", commitAt, code: "parse-failed" });
  const data = project.updateMany.mock.calls[0]?.[0].data;
  expect(Object.keys(data)).toEqual(["lastImportError"]);
});

/** 조건이 안 맞으면 0건이다 — 오배송·보관·역행·회전된 토큰이 전부 여기로 접힌다. */
it("reports rejected when the conditional update matches nothing", async () => {
  const { db } = fixture(0);
  expect(await recordReportedFailure(db, { projectId: "p1", surfaceId: "s1", tokenHash: "h", commitAt, code: "parse-failed" })).toBe("rejected");
});
