import { decodeUser, readable } from "@/lib/credentials/records";
import { validatePiiReadKeys } from "@/lib/credentials/storage";
import { m } from "@/lib/i18n";
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { maskedEmailLabels } from "@/lib/auth/invite-label";

import { SYNC_LOG_PAGE_SIZE } from "./plan";
import { decodeCursor, type SyncRunRow } from "./view";

/**
 * `logs` 화면의 조회 (7단계 — design §6).
 *
 * ⚠️ **`projectId`로 좁힌다** — 인가는 호출부(`requireProjectAccess`)가 이미 지났고 여기 오는
 * `projectId`는 그 판정의 산출물이다. 인덱스도 `[projectId, startedAt]`이라 좁히지 않으면 풀스캔이고,
 * 더 중요하게는 **테넌트 간 데이터가 새는 경로**가 된다 (RLS가 없어 애플리케이션이 유일한 방어선이다).
 *
 * ⚠️ **원문 이메일을 안 돌려준다** (sec-audit 발견 4). 반환 타입이 `emailLabel`이고 마스킹을 여기서
 * 한다 — 클라이언트에서 가리면 원문이 이미 RSC 페이로드에 있다. `loadMembers`와 같은 규칙이고,
 * 라벨은 **목록 전체를 보고** 만든다(행마다 따로 만들면 같은 도메인의 두 주소가 같은 라벨이 된다).
 *
 * ⚠️ **`try`로 감싸지 않는다.** 조회가 실패하면 던져서 Next 오류 화면이 되어야 한다 — 빈 배열로
 * 접으면 "아직 실행이 없다"와 "물어보지 못했다"가 바이트 단위로 같아진다 (POSTMORTEM 2026-09-03).
 */
export type SyncLogPage = {
  rows: SyncRunRow[];
  /** 다음 페이지의 커서. 없으면 마지막 페이지다. */
  nextCursor: { startedAt: Date; id: string } | null;
};

export async function loadSyncRuns(
  prisma: PrismaClient,
  projectId: string,
  rawCursor: string | undefined,
): Promise<SyncLogPage> {
  // ⚠️ **무효 커서는 첫 페이지다** — 주소창 값이라 500이 되면 안 된다 (`decodeCursor`).
  const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);

  const rows = await prisma.syncRun.findMany({
    where: {
      projectId,
      // 키셋 페이지네이션 — `startedAt` 하나로는 같은 밀리초의 두 행이 서로를 건너뛴다.
      ...(cursor === null
        ? {}
        : {
            OR: [
              { startedAt: { lt: cursor.startedAt } },
              { startedAt: cursor.startedAt, id: { lt: cursor.id } },
            ],
          }),
    },
    // ⚠️ 정렬 키 둘이 커서 둘과 **같아야 한다** — 하나라도 어긋나면 페이지 경계에서 행이 사라지거나 겹친다.
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    // 한 개 더 읽어 "다음 페이지가 있나"를 조회 하나로 답한다 — `count`를 따로 부르면 왕복이 는다.
    take: SYNC_LOG_PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      trigger: true,
      errorCode: true,
      startedAt: true,
      finishedAt: true,
      changed: true,
      warnings: true,
      prUrl: true,
      // ⚠️ `email`을 **읽되 돌려주지 않는다** — 가리려면 원문이 필요하고, 나가면 안 되는 것은 반환값이다.
      requester: { select: { id: true, name: true, email: true, emailLookup: true } },
    },
  });

  // 행 하나가 못 열려도 이력은 산다 — 키 부재만 장애로 남긴다 (`loadMembers`와 같은 규칙).
  validatePiiReadKeys();
  const page = rows.slice(0, SYNC_LOG_PAGE_SIZE).map(r => ({
    ...r,
    requester: r.requester === null ? null : readable(() => decodeUser(r.requester!)),
    hadRequester: r.requester !== null,
  }));
  const labels = maskedEmailLabels(page.map((r) => r.requester?.email ?? ""));
  const last = page.at(-1);
  return {
    rows: page.map((r, i) => ({
      id: r.id,
      status: r.status,
      trigger: r.trigger,
      errorCode: r.errorCode,
      requester:
        !r.hadRequester
          ? null
          : r.requester === null
            ? { name: null, emailLabel: m.common.unreadable }
            : { name: r.requester.name, emailLabel: r.requester.email ? (labels[i] ?? null) : null },
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      changed: r.changed,
      warnings: r.warnings,
      prUrl: r.prUrl,
    })),
    // 한 개 더 읽혔을 때만 다음 페이지가 있다. `last`가 그 경계의 마지막 행이다.
    nextCursor: rows.length > SYNC_LOG_PAGE_SIZE && last !== undefined
      ? { startedAt: last.startedAt, id: last.id }
      : null,
  };
}
