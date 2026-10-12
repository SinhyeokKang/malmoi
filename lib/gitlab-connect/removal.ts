import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { recordEvent } from "@/lib/events/record";

/**
 * **연결이 끊긴 사건** (gitlab-repositories D20). 계정 GitLab 연결 해제·연결자의 멤버 제거로 프로젝트의 연결 참조가 비면 그 프로젝트마다 **같은 tx에서**
 * 이 사건을 남긴다 — 프로젝트가 `Disconnected`가 되는 것은 프로젝트 상태 변경이다(CLAUDE.md "상태 변경은 변경과 같은 트랜잭션에서").
 * Logs 문장은 E-ui가 붙인다(그 전에는 settings 폴백 문장).
 *
 * ⚠️ 연결 id·GitLab 사용자 id·토큰을 싣지 않는다 — 사람이 읽을 사실은 "어느 리포의 연결이 끊겼나"뿐이다(`settings.repositoryConnected`와 같은 형).
 * ⚠️ 계정 삭제(`User` Cascade → FK `SET NULL`)는 이 사건을 남기지 않는다 — D20 범위 밖이고, FK는 그 경로의 그물이다.
 */
export const CONNECTION_REMOVED_SUBTYPE = "settings.repositoryDisconnected";

/** 호출부가 이미 그 `Project` 행을 잠갔다(`lockProjectAccess` · 해제 코어의 정렬 잠금). */
export async function recordConnectionRemoved(
  tx: Prisma.TransactionClient,
  input: { projectId: string; actorUserId: string; repoOwner: string; repoName: string },
): Promise<void> {
  await recordEvent(tx, {
    projectId: input.projectId,
    subtype: CONNECTION_REMOVED_SUBTYPE,
    actor: { kind: "USER", userId: input.actorUserId },
    scope: "project-wide",
    payload: { kind: "SETTINGS", field: "repository", value: { before: `${input.repoOwner}/${input.repoName}`, after: null } },
  });
}
