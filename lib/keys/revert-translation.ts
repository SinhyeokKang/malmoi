import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Subject } from "@/lib/auth/subject";
import { isProjectReady } from "@/lib/projects/ready";
import { getSurfaceAccess } from "@/lib/surfaces/access";

import { executeKeyRevert, previewKeyRevert, type RevertPreview, type RevertResult } from "./revert";

export const RevertInput = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), keyId: z.string().min(1) });
export const RevertExecuteInput = RevertInput.extend({ confirmation: z.string().regex(/^[0-9a-f]{64}$/) });

export type RevertAccessError = { status: "error"; error: string };
type RevertForbidden = { status: "blocked"; reason: "forbidden" };

/**
 * **Revert의 공유 코어** (mcp-connector T4-a). 편집 UI와 MCP의 `preview_revert`·`revert_to_last_sent`가 같은 선행 인가·readiness를 지난다.
 * ⚠️ **권한은 `project:settings`(OWNER)다** — EDITOR에게는 거부를 `blocked: forbidden`으로 돌려준다. 화면이 버튼을 숨기지 않고
 * 사유를 붙이는 계약이라, 접근 오류와 다른 자리에 싣는다.
 * ⚠️ 두 함수가 인가를 각자 부른다 — `entry-points.test.ts`가 위임 코어의 본문에서 가드 호출을 센다(헬퍼로 한 겹 더 감추면 못 센다).
 */

/** 읽기 전용 — 확인값(지문)을 발급한다. */
export async function previewRevert(
  prisma: PrismaClient, subject: Subject, input: z.infer<typeof RevertInput>,
): Promise<RevertPreview | RevertAccessError | RevertForbidden> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status === "forbidden") return { status: "blocked", reason: "forbidden" };
  if (access.status !== "ok") return { status: "error", error: access.status };
  if (!(await isProjectReady(prisma, access.projectId))) return { status: "error", error: "not-ready" };
  return previewKeyRevert(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug: input.surfaceSlug, keyId: input.keyId, userId: subject.userId });
}

/**
 * 미리보기가 발급한 지문을 되돌려 받을 때만 쓴다 — 잠금 뒤 다시 재서 다르면 `reconfirm`이고 쓰기 0건이다.
 * DB 실패는 던진다 — 커밋 뒤 응답만 유실될 수 있으므로 호출자는 "결과 미확인"으로 받고 같은 지문으로 재실행하지 않는다.
 */
export async function runRevert(
  prisma: PrismaClient, subject: Subject, input: z.infer<typeof RevertExecuteInput>,
): Promise<RevertResult | RevertAccessError | RevertForbidden> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status === "forbidden") return { status: "blocked", reason: "forbidden" };
  if (access.status !== "ok") return { status: "error", error: access.status };
  if (!(await isProjectReady(prisma, access.projectId))) return { status: "error", error: "not-ready" };
  return executeKeyRevert(prisma, {
    projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug: input.surfaceSlug, keyId: input.keyId, userId: subject.userId, credential: subject.credential, confirmation: input.confirmation,
  });
}
