import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { lockProjectAccess } from "@/lib/auth/lock";
import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import { generatePushToken, hashPushToken } from "@/lib/push/token";

import { checkRepoAccess, type OnboardFailure } from "./access";

export type RotateTokenResult =
  | { ok: true; pushToken: string }
  | { ok: false; error: OnboardFailure | AccessError };

/**
 * **push 토큰 재발급의 공유 코어** (mcp-connector T4-c) — 편집 UI 설정과 MCP `rotate_push_token`. **원문은 이 반환값에만 있다.**
 * 두 자격증명이 만나서(리포 쓰기 권한 확인 = 사용자 토큰, 이후 App 토큰 경로) `lib/projects`가 아니라 여기 있다.
 *
 * ⚠️ **회전하면 옛 토큰이 즉시 무효다.** 대상 리포의 `PUSH_TOKEN` secret을 바꾸기 전까지 그 리포의 CI는 401이다.
 * 재검증(보관 거부의 다시 그리기 포함)은 호출자의 몫이다.
 */
export async function rotateToken(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<RotateTokenResult> {
  const { slug } = input;
  const { userId, tokenId } = subject;
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  // 보관 = Restore만 — 거부될 요청이 GitHub을 부르지 않게 먼저 막는다. 경합 창은 잠금 안 판정이 닫는다.
  if (access.archived) return { ok: false, error: "archived" };

  /**
   * ⚠️ **토큰을 받는 사람이 리포에 쓸 수 있어야 한다** (sec-audit-3 결정 I). push 토큰의 페이로드가 로케일을 정하고 그
   * 로케일이 설치 토큰의 커밋 경로가 된다(`locales:["en","app"]` → `app.json` — 3글자라 모양 검사가 못 막는다).
   * 쓰기 권한 없이 초대된 OWNER가 여기서 토큰을 받으면 생성 경로(1a)가 닫은 격차가 다시 열린다.
   */
  const project = await prisma.project.findUnique({
    where: { id: access.projectId },
    select: { repoOwner: true, repoName: true, installationId: true, repositoryId: true },
  });
  if (project === null) return { ok: false, error: "not-found" };
  // 확인할 리포가 없다 — 쓰기 권한을 증명할 수단이 없으므로 발급하지 않는다.
  if (project.installationId === null || project.repositoryId === null) return { ok: false, error: "repo-not-installed" };
  const repo = await checkRepoAccess(prisma, userId, project.repoOwner, project.repoName, true);
  if (repo.status !== "ok") return { ok: false, error: repo.error };
  // 같은 이름의 **다른** 리포에 쓸 수 있는 것은 근거가 아니다 — 고정된 신원으로 대조한다.
  if (repo.repositoryId !== project.repositoryId) return { ok: false, error: "repo-forbidden" };

  const pushToken = generatePushToken();
  // ⚠️ `where`가 **인가가 돌려준 projectId**다.
  const locked = await prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: access.projectId, userId, permission: "project:settings", tokenId });
    if (locked.status !== "ok") return locked;
    await tx.project.update({
      where: { id: access.projectId },
      data: { pushTokenHash: hashPushToken(pushToken) },
    });
    /**
     * ⚠️ **값도 해시도 payload에 없다** (spec §3.C.14 · T5c). 남는 것은 "회전했다"는 사실뿐이고,
     * 그 사실이 곧 "그 리포의 CI가 지금부터 401이다"를 설명한다.
     */
    await recordEvent(tx, {
      projectId: access.projectId,
      subtype: "settings.pushTokenRotated",
      actor: { kind: "USER", userId },
      scope: "project-wide",
      payload: { kind: "SETTINGS", field: "pushToken", value: null },
    });
    return locked;
  });
  if (locked.status !== "ok") return { ok: false, error: locked.status };
  return { ok: true, pushToken };
}
