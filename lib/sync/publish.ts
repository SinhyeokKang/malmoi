import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import type { NotStartedReason } from "@/lib/events/payload";
import { recordEvent } from "@/lib/events/record";
import { isProjectReady } from "@/lib/projects/ready";
import type { PullOutcome } from "@/lib/pull/message";

import { runSync } from "./run";

/**
 * **Publish의 공유 코어** (mcp-connector T4-a). 편집 UI의 `triggerPullAction`과 MCP의 `publish`가 같은 인가·readiness·거부 기록을 지난다.
 * 재검증은 호출자의 몫이고 `attempted`가 그 신호다 — 실행기에 닿았으면 스킵·실패에도 지운다(`triggerPullAction` 주석). 실행 전
 * 거부(접근·readiness)는 아무것도 안 바꿨으니 지우지 않는다.
 *
 * **EDITOR도 부를 수 있다** — Publish는 base branch 직접 쓰기가 아니라 검토 가능한 PR 생성이다(PRODUCT §3). 그래서 permission이
 * `translation:write`이고 별도 권한을 두지 않았다. **커밋 작성자는 항상 App 토큰이다** — `triggerPull`이 `createGitClient`만 쓴다.
 */
export async function publishProject(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<{ outcome: PullOutcome; attempted: boolean }> {
  const { userId } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "translation:write" });
  if (access.status !== "ok") {
    /**
     * ⚠️ **거부 여섯 중 여기서 기록하는 것은 `archived` 하나다** (logs-rework spec §6.1 — T5d).
     * 세션·멤버십 거부는 **payload가 주장하는 프로젝트에 아무것도 쓰지 않는다**: 인가되지 않은
     * 호출이 남의 프로젝트 이력에 줄을 하나 세울 수 있으면 그 자체가 쓰기 경로다.
     */
    if (access.status === "archived") await recordPublishRefusal(prisma, access.projectId, userId, "archived");
    return { outcome: { status: "failed", error: access.status, delivery: "not-started", retryable: false }, attempted: false };
  }

  // 첫 적재 전에는 내보낼 것이 없다 — `triggerPull`이 저장되지 않은 포맷으로 `fail()`하는 대신
  // 여기서 문구가 있는 사유로 거부한다 (PRODUCT §7.5).
  if (!(await isProjectReady(prisma, access.projectId))) {
    await recordPublishRefusal(prisma, access.projectId, userId, "not-ready");
    return { outcome: { status: "failed", error: "not-ready", delivery: "not-started", retryable: false }, attempted: false };
  }

  /**
   * ⚠️ **`triggerPull`을 직접 부르지 않는다** (7단계). `runSync`가 게이트(동시 실행·최소 간격)·
   * `SyncRun` 행·오류 분류를 들고, **던지지 않는다**. 남의 라이브러리 메시지를 `ref`로 접는 규칙도
   * 그쪽에 있다(`publish-failure.test.ts`가 이 경로로 그것을 계속 잰다).
   */
  return { outcome: await runSync(prisma, { projectId: access.projectId, slug: input.slug, trigger: "manual", requestedBy: userId, tokenId: subject.tokenId }), attempted: true };
}

/**
 * **다음 번에도 같은 이유로 거부될 것만 남긴다** (결정 7). `already-running`·`too-soon`은 한 번 더
 * 누르면 사라지므로 이력에 없다 — `SyncRun`이 그 거부를 행으로 만들지 않는 기존 판정과 같다.
 *
 * ⚠️ **`scope: "project-wide"`다** — 거부는 소스를 고르기 전에 일어난다. 빈 배열을 `not-recorded`로
 * 두면 "모른다"가 되는데, 여기는 정말로 프로젝트 전체의 일이다.
 */
async function recordPublishRefusal(prisma: PrismaClient, projectId: string, userId: string, refusal: NotStartedReason): Promise<void> {
  await recordEvent(prisma, {
    projectId,
    subtype: "publish.notStarted",
    actor: { kind: "USER", userId },
    result: "notStarted",
    scope: "project-wide",
    payload: { kind: "PUBLISH", surfaceSlugs: [], refusal },
  });
}
