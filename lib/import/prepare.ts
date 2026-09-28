import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { logFailure } from "@/lib/github-connect/log";

import { readDiscardApproval } from "./approval";

/**
 * 수동 Sync 확인 전에 **폐기 승인 지문을 발급한다** — 공유 코어 (mcp-connector T4-a · ARCHITECTURE §5.5.2의 폐기 승인). OWNER 전용 —
 * Sync와 같은 권한이다.
 *
 * ⚠️ **토큰 원문을 돌려주지 않는다** — 지문과 건수만 간다. 원문이 호출자에게 가면 지문을 스스로 만들 수 있다.
 * ⚠️ 실패는 `undefined`다 — 화면은 `null` 승인으로 실행하고 서버가 reconfirm으로 답한다(폐기가 조용히 열리는 경로가 없다).
 */
export async function prepareSync(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<{ approval: string; unsent: number } | undefined> {
  const access = await getProjectAccess(prisma, { userId: subject.userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return undefined;
  try {
    const { fingerprint, pending } = await readDiscardApproval(prisma, { projectId: access.projectId, userId: subject.userId });
    return { approval: fingerprint, unsent: pending.length };
  } catch (error) {
    logFailure("repository-sync-prepare", error);
    return undefined;
  }
}
