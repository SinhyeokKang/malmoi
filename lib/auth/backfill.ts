import type { Role } from "./permission";

/**
 * 기존 `Project`에 OWNER를 채우는 **일회성** 판정 (design §5 배포 순서 2).
 *
 * ⚠️ 이 backfill을 빠뜨린 채 인가 전환을 배포하면 **아무도 어느 프로젝트에도 못 들어간다** —
 * fail-closed라 그렇게 되는 것이 옳지만 복구가 SQL이다.
 *
 * **멱등성이 여기서 결정된다.** 스크립트를 두 번 돌려 행 수를 세는 수동 확인 대신 `pnpm test`가
 * 판정한다 — 스크립트는 이 결과를 upsert하는 I/O 껍데기다.
 *
 * ⚠️ **인가 전환이 끝나면 이 파일과 스크립트를 지운다** (tasks §8). 일회성 코드가 남으면
 * 다음 사람이 그것을 정상 경로로 읽는다.
 */

export type BackfillRow = { projectId: string; userId: string; role: "OWNER" };

/**
 * @param members 판정에 필요한 것만 받는다 — "이 프로젝트에 OWNER가 있나"뿐이라 `userId`가 없다.
 *
 * **소유자가 이미 EDITOR로 들어 있는 프로젝트에도 행을 낸다.** `@@unique([projectId, userId])`가
 * 있으므로 스크립트의 upsert가 역할을 OWNER로 올린다 — OWNER 없는 프로젝트를 남기는 것보다 낫다.
 */
export function planOwnerBackfill(input: {
  projects: readonly { id: string }[];
  members: readonly { projectId: string; role: Role }[];
  ownerUserId: string;
}): BackfillRow[] {
  const { projects, members, ownerUserId } = input;

  const owned = new Set(members.filter((m) => m.role === "OWNER").map((m) => m.projectId));

  // 입력 순서를 그대로 따른다 — 같은 입력이 같은 순서를 내야 dry-run 출력을 사람이 대조할 수 있다.
  return projects
    .filter((p) => !owned.has(p.id))
    .map((p) => ({ projectId: p.id, userId: ownerUserId, role: "OWNER" as const }));
}
