import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { logFailure } from "@/lib/github-connect/log";

import { PreviewBaseFileMissing, PreviewBaseFileUnreadable, PreviewWriterWarnings, type PublishPreviewResult } from "./preview";
import { readPublishPreview } from "./read";

/**
 * **Publish 미리보기의 공유 코어** (mcp-connector T4-a). 읽기만 한다.
 *
 * ⚠️ **거부와 읽기 실패를 한 갈래로 접지 않는다** (launch-readiness L3.3) — 거부는 실행 전 거부(`1h`)로 흐르고, 오류 값은
 * `publishProject`의 실행 전 거부와 같은 낱말이다.
 */
export async function loadPreview(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<PublishPreviewResult> {
  try {
    const access = await getProjectAccess(prisma, { userId: subject.userId, slug: input.slug, permission: "translation:write" });
    if (access.status !== "ok") return { status: "rejected", error: access.status };
    return { status: "ok", preview: await readPublishPreview(prisma, access.projectId, input.slug) };
  } catch (error) {
    // 이유가 있는 거부다 — Try again으로 그리면 같은 거부를 영영 받는다(L3.3). 경로·브랜치는 설정값이라 화면에 실어도 된다.
    if (error instanceof PreviewBaseFileMissing) return { status: "refused", reason: "base-file-missing", path: error.path, branch: error.branch };
    if (error instanceof PreviewBaseFileUnreadable) return { status: "refused", reason: "base-file-unreadable", path: error.path, branch: error.branch };
    if (error instanceof PreviewWriterWarnings) return { status: "blocked", warnings: error.warnings };
    logFailure("publish-preview", error); return { status: "failed" };
  }
}
