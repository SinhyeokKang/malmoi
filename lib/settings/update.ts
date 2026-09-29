import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { AccessError } from "@/lib/auth/message";
import { lockProjectAccess } from "@/lib/auth/lock";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import { describeFailure } from "@/lib/failure";
import { planProjectName } from "@/lib/projects/plan";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { invalidateDeliveryConfirmations } from "@/lib/pull/load";
import { isSyncBranchName } from "@/lib/pull/ref-slug";

import type { RepositorySettingsError } from "./message";

/**
 * **프로젝트 설정의 공유 코어** (mcp-connector T4-b) — 이름·기준 브랜치. 편집 UI의 설정 Action과 MCP `update_project`가 같은 인가·
 * 검증·잠금 tx·사건을 지난다. 재검증(보관 거부의 다시 그리기 포함)은 호출자의 몫이다.
 */

export const BaseBranchInput = z.object({
  slug: z.string().min(1),
  /** 트림하지 않는다 — `isValidBranchName`이 앞뒤 공백을 **거부**한다 (그 모듈의 경고). */
  baseBranch: z.string().min(1),
});

export type BaseBranchResult = { ok: true } | { ok: false; error: RepositorySettingsError | AccessError };

/**
 * 기준 브랜치 — `Project.baseBranch`를 **즉시** 쓴다. `checkFormat`이 보지 않는 축이라 대기 개념이 없다.
 * ⚠️ **`Translation`·`StringKey`를 건드리지 않는다.** 재적재 경로는 CI 하나뿐이고 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.
 */
export async function changeBaseBranch(prisma: PrismaClient, subject: Subject, input: z.infer<typeof BaseBranchInput>): Promise<BaseBranchResult> {
  const { slug, baseBranch } = input;
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  /**
   * 형식은 저장 전에 본다 — **여기서는** GitHub을 부르지 않는다(브랜치의 실존은 pull이 시끄럽게 말한다, DESIGN §6.6).
   * 목록은 조회 시점의 안내일 뿐이므로 저장 인가와 형식 검증은 이 코어가 계속 맡는다. 300개 초과 시 자유 입력도 이 검증을 지난다.
   * ⚠️ **검증 함수는 한 벌이다** — 양쪽 다 `isValidBranchName`이고, 갈리면 온보딩이 통과시킨 이름을 설정이 거부한다.
   */
  if (!isValidBranchName(baseBranch)) return { ok: false, error: "invalid-branch" };
  // 목록에서 빠져도 자유 입력(300개 초과)·직접 호출이 같은 이름을 보낸다 (malmoi#126).
  if (isSyncBranchName(baseBranch)) return { ok: false, error: "sync-branch" };

  return prisma.$transaction(async (tx) => {
    // 잠금 뒤 읽어야 동시 변경의 before와 no-op 판정이 실제 저장 직전 상태를 가리킨다.
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "project:settings", credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { baseBranch: true } });
    if (project === null) return { ok: false, error: "not-found" } as const;
    if (baseBranch !== project.baseBranch) {
      await tx.project.update({ where: { id: projectId }, data: { baseBranch } });
      // 브랜치는 되돌릴 수 있어 context 지문만으로는 옛 확인이 부활한다 — 같은 tx에서 무효화한다 (ARCHITECTURE §5.8).
      await invalidateDeliveryConfirmations(tx, projectId);
      await recordEvent(tx, {
        projectId,
        subtype: "settings.baseBranchChanged",
        actor: { kind: "USER", userId },
        scope: "project-wide",
        payload: { kind: "SETTINGS", field: "baseBranch", value: { before: project.baseBranch, after: baseBranch } },
      });
    }
    return { ok: true } as const;
  });
}

export const ProjectNameInput = z.object({ slug: z.string().min(1), name: z.string() });

export type ProjectNameResult = { ok: true; name: string } | { ok: false; error: "empty" | "too-long" | AccessError };

/** 이름 — 같은 이름이면 사건 없이 성공이다. DB 실패는 `unavailable`로 접는다(원인은 로그). */
export async function renameProject(prisma: PrismaClient, subject: Subject, input: z.infer<typeof ProjectNameInput>): Promise<ProjectNameResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const plan = planProjectName(input.name);
  if (!plan.ok) return { ok: false, error: plan.reason };
  // 보관 = Restore만 (PRODUCT §7.9) — 보관 중 거부는 잠금 안 판정이 한다.
  let locked;
  try {
    locked = await prisma.$transaction(async (tx) => {
      const locked = await lockProjectAccess(tx, { projectId: access.projectId, userId, permission: "project:settings", credential });
      if (locked.status !== "ok") return locked;
      const row = await tx.project.findUnique({ where: { id: access.projectId }, select: { name: true } });
      if (!row) throw new Error("Project disappeared");
      // 잠금 뒤에 읽은 값이라 `before`가 실제로 내가 덮은 이름이다.
      if (row.name === plan.name) return locked;
      await tx.project.update({ where: { id: access.projectId }, data: { name: plan.name } });
      await recordEvent(tx, {
        projectId: access.projectId,
        subtype: "settings.nameChanged",
        actor: { kind: "USER", userId },
        scope: "project-wide",
        payload: { kind: "SETTINGS", field: "name", value: { before: row.name, after: plan.name } },
      });
      return locked;
    });
  }
  catch (error) { console.error("Project name update failed.", { projectId: access.projectId, cause: describeFailure(error) }); return { ok: false, error: "unavailable" }; }
  if (locked.status !== "ok") return { ok: false, error: locked.status };
  return { ok: true, name: plan.name };
}
