import { expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { abandonImportRun, finishImportRun, markImportStarted, recordReportedFailure } from "../import-status-store";

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
    /**
     * ⚠️ **종료 필드 셋을 `importOutcomeFields`가 한 벌로 낸다** (2026-09-15) — 나열하면 컬럼이 늘
     * 때마다 종료 경로 다섯 중 몇이 조용히 빠진다. `lastImportFailedAt`이 실제로 그렇게 둘에만 붙었다.
     */
    data: { lastImportStartedAt: null, lastImportToken: null, lastImportError: "import-failed", lastImportFailedAt: expect.any(Date) },
  });
});

/** 실패 기록이 실패해도 원래 오류를 덮지 않는다 — 호출부가 그 뒤에 던진다. */
it("swallows its own write failure", async () => {
  const { db, project } = fixture();
  project.updateMany.mockRejectedValue(new Error("connection lost"));
  await expect(finishImportRun(db, { projectId: "p1", surfaceId: "s1", token: "run-token", code: "import-failed" })).resolves.toBeUndefined();
});

/**
 * **삼키되 무음은 아니다** (audit #71 — POSTMORTEM 2026-09-14 형태). 여기서 버린 실패는 화면에 300초 "진행 중"으로만
 * 남으므로 원인을 볼 곳이 서버 로그뿐이다. 성공한 쓰기는 한 줄도 안 남긴다 — 짝 단언.
 */
it("logs its own swallowed write failure, and stays silent on success", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const ok = fixture();
    await finishImportRun(ok.db, { projectId: "p1", surfaceId: "s1", token: "run-token", code: "import-failed" });
    await abandonImportRun(ok.db, { projectId: "p1", surfaceId: "s1", token: "run-token" });
    expect(ok.project.updateMany).toHaveBeenCalledTimes(2);
    expect(spy).not.toHaveBeenCalled();

    const { db, project } = fixture();
    project.updateMany.mockRejectedValue(new TypeError("connection lost to secret host"));
    await finishImportRun(db, { projectId: "p1", surfaceId: "s1", token: "run-token", code: "import-failed" });
    await abandonImportRun(db, { projectId: "p1", surfaceId: "s1", token: "run-token" });
    expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/^\[import-status\] \w{8} finish: TypeError$/),
      expect.stringMatching(/^\[import-status\] \w{8} abandon: TypeError$/),
    ]);
  } finally {
    spy.mockRestore();
  }
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
    data: { lastImportError: "parse-failed", lastImportFailedAt: expect.any(Date) },
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
  /**
   * ⚠️ **`lastImportFailedAt`은 2026-09-15에 늘었다** (project-home) — 그 항목이 Home에서 검토·미채움과
   * 한 시간축에 서려면 시각이 필요하고, 그것을 만드는 자리가 여기뿐이다. 나머지 둘은 여전히 안 쓴다.
   */
  expect(Object.keys(data)).toEqual(["lastImportError", "lastImportFailedAt"]);
});

/** 조건이 안 맞으면 0건이다 — 오배송·보관·역행·회전된 토큰이 전부 여기로 접힌다. */
it("reports rejected when the conditional update matches nothing", async () => {
  const { db } = fixture(0);
  expect(await recordReportedFailure(db, { projectId: "p1", surfaceId: "s1", tokenHash: "h", commitAt, code: "parse-failed" })).toBe("rejected");
});
