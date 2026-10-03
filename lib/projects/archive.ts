import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { lockProjectAccess } from "@/lib/auth/lock";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";

import { lockOwnerSlots } from "./owner-limit";

/**
 * **보관·복원의 공유 코어** (mcp-connector T4-b). 편집 UI와 MCP `archive_project`·`unarchive_project`가 같은 인가·잠금 tx·사건을 지난다.
 *
 * **되돌릴 수 있는 사실 하나를 쓴다** — 상태 머신도 삭제도 아니다. 그 사실 하나가 편집·Publish·야간 cron·CI push를 한꺼번에 멈춘다.
 * ⚠️ **인가가 `project:settings`다** — 보관된 프로젝트에서도 지나간다(`planProjectAccess`가 그 permission만 통과시킨다).
 * ⚠️ **열린 PR을 닫지 않는다** (PRODUCT §7.9). 재검증(`revalidatePath("/", "layout")`)은 호출자의 몫이다.
 */
export type ArchiveResult = { ok: true } | { ok: false; error: string };

export async function runArchive(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<ArchiveResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  // ⚠️ `where`가 **인가가 돌려준 projectId**다 — slug로 다시 찾으면 클라이언트 입력이 조회 조건이 된다.
  const archived = await prisma.$transaction(async (tx) => {
    // 보관 토글은 보관 중에도 통과한다 — 이미 보관됐으면 아래에서 no-op이다(PRODUCT §7.9).
    const locked = await lockProjectAccess(tx, { projectId: access.projectId, userId, permission: "project:settings", archiveToggle: true, credential });
    if (locked.status !== "ok") return locked;
    const project = await tx.project.findUnique({ where: { id: access.projectId }, select: { archivedAt: true } });
    if (project === null || project.archivedAt !== null) return locked;
    await tx.project.update({ where: { id: access.projectId }, data: { archivedAt: new Date() } });
    // ⚠️ **보관 사건 자체를 읽을 수 있어야 한다** — 그 때문에 Logs가 보관된 프로젝트에서도 열린다(완료조건 11).
    await recordEvent(tx, {
      projectId: access.projectId,
      subtype: "settings.archived",
      actor: { kind: "USER", userId },
      scope: "project-wide",
      payload: { kind: "SETTINGS", field: "archived", value: { before: null, after: "archived" } },
    });
    return locked;
  });
  return archived.status === "ok" ? { ok: true } : { ok: false, error: archived.status };
}

/**
 * 되돌리기. **확인을 묻지 않는다** — 잃는 것이 없다.
 * ⚠️ **위와 한 함수로 합치지 않는다** — 인가 호출을 공용 헬퍼로 빼면 `entry-points.test.ts`가 위임 코어 본문에서 그것을 못 센다.
 */
export async function runUnarchive(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<ArchiveResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  const restored = await prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: access.projectId, userId, permission: "project:settings", archiveToggle: true, credential });
    if (locked.status !== "ok") return locked;
    const project = await tx.project.findUnique({ where: { id: access.projectId }, select: { archivedAt: true } });
    if (project === null || project.archivedAt === null) return locked;
    /**
     * ⚠️ **복원은 OWNER 전원의 활성 프로젝트를 하나씩 늘린다** — 상한이 생성에만 있으면 "보관 → 생성 → 복원"이 넷을 만든다
     * (operator-account C6). 보관 중이라 지금 그들의 셈에 안 들어 있다. 잠금은 `lockProjectAccess`(Project) **뒤**다.
     */
    const owners = await tx.projectMember.findMany({ where: { projectId: access.projectId, role: "OWNER" }, select: { userId: true } });
    if ((await lockOwnerSlots(tx, owners.map((owner) => owner.userId))).length > 0) return { status: "owner-limit-reached" as const };
    await tx.project.update({ where: { id: access.projectId }, data: { archivedAt: null } });
    await recordEvent(tx, {
      projectId: access.projectId,
      subtype: "settings.restored",
      actor: { kind: "USER", userId },
      scope: "project-wide",
      payload: { kind: "SETTINGS", field: "archived", value: { before: "archived", after: null } },
    });
    return locked;
  });
  return restored.status === "ok" ? { ok: true } : { ok: false, error: restored.status };
}
