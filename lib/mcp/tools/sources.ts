import "server-only";
import { z } from "zod";

import { en } from "@/messages/en";
import { redrawIfArchived, settleRevalidate } from "@/lib/revalidate-after-commit";
import { removalReason, type SourceRemovalError } from "@/lib/surfaces/plan-removal";
import { previewSurfaceRemoval, removeSurface } from "@/lib/surfaces/remove";
import { revalidatePath } from "next/cache";

import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **소스 제거 둘** (sources-add-remove — ARCHITECTURE §5.9). 웹 `previewSourceRemoval`·`removeSource`와 같은 코어의 형제 껍데기이고,
 * 수동 Sync 도구(`preview_sync` → `sync_repository`)와 같은 미리보기 → 실행 형이다 — 미전달이 있으면 미리보기의 지문을 되돌려 받는다.
 */
const SourceInput = z.object({ slug: z.string().min(1).max(200), surfaceSlug: z.string().min(1).max(200) });

/** 제거 고유의 거부만 화면 문장을 싣는다 — 인가 거부는 결과 경계(`toToolResult`)가 인가 문장을 붙인다. */
function refused(error: SourceRemovalError) {
  const own = error === "last-source" || error === "importing" || error === "stale-approval";
  return { status: "refused" as const, code: error, ...(own ? { message: removalReason(en, error) } : {}) };
}

export const previewSourceRemovalTool = defineTool({
  name: "preview_source_removal",
  inputSchema: SourceInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "preview_source_removal", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const preview = await previewSurfaceRemoval(prisma, coreSubject(subject), input);
    if (!preview.ok) return refused(preview.error);
    return ok({ approval: preview.approval, unsentEdits: preview.pendingCount, pullRequest: preview.openPr }, en.mcp.summary.sourceRemovalPreview(preview.pendingCount));
  },
});

export const removeSourceTool = defineTool({
  name: "remove_source",
  // ⚠️ `approval`을 optional로 두지 않는다 — 미전달이 없으면 `null`을 명시한다(수동 Sync처럼 "보냈나"를 서버가 추측하지 않는다).
  inputSchema: SourceInput.extend({ approval: z.string().min(1).max(128).nullable() }),
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "remove_source", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await removeSurface(prisma, coreSubject(subject), input);
    if (!result.ok) return redrawIfArchived(input.slug, result.error, refused(result.error));
    // 웹 `removeSource`와 같은 둘이다.
    settleRevalidate("source-remove", () => {
      revalidatePath(`/projects/${input.slug}`, "layout");
      revalidatePath("/projects");
    });
    return ok({ removed: input.surfaceSlug }, en.mcp.summary.sourceRemoved(input.surfaceSlug));
  },
});
