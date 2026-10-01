import "server-only";
import { z } from "zod";

import { m } from "@/lib/i18n";
import { planImportConfirmation } from "@/lib/import/confirm";
import { prepareSync } from "@/lib/import/prepare";
import { importRepository } from "@/lib/onboarding-run/import";
import { pick } from "@/lib/i18n";
import { settleRevalidate } from "@/lib/revalidate-after-commit";
import { revalidatePath } from "next/cache";

import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **수동 Sync 미리보기** (design §2.1). 폐기 승인 지문과 미전달 편집 수를 준다 — `sync_repository`가 지문을 되돌려 받고 잠금 뒤 재계산해
 * 대조한다. 토큰 원문은 싣지 않는다(`prepareSync`). 열린 PR 조회는 화면의 Dialog가 따로 하므로 여기선 모른다(`openPr: undefined`).
 */
export const previewSync = defineTool({
  name: "preview_sync",
  inputSchema: z.object({ slug: z.string().min(1).max(200) }),
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "preview_sync", slug });
    if (gate.status !== "ok") return gate;
    const prepared = await prepareSync(prisma, coreSubject(subject), { slug });
    // 입구를 지났는데 undefined면 조회 장애다 — 인가 거부는 위에서 이미 갈렸다.
    if (prepared === undefined) return { status: "unavailable" };
    const plan = planImportConfirmation({ unsent: prepared.unsent, openPr: undefined });
    return ok({ approval: prepared.approval, unsentEdits: prepared.unsent, discardsEdits: plan.recommendSend }, m.mcp.summary.syncPreview(prepared.unsent));
  },
});

/**
 * **수동 Sync** (design §2.2) — 리포 값으로 번역을 덮는다(미전달 편집 폐기 포함 · destructive). `preview_sync`가 준 **폐기 승인 지문**을
 * 되돌려 받아야 하고, 실행권 tx가 잠금 뒤 재계산해 다르면 `reconfirm`이고 아무것도 버리지 않는다. boolean 동의는 받지 않는다.
 */
export const syncRepository = defineTool({
  name: "sync_repository",
  inputSchema: z.object({ slug: z.string().min(1).max(200), approval: z.string().min(1).max(128) }),
  async run({ prisma, subject }, { slug, approval }) {
    const gate = await checkProjectTool(prisma, subject, { name: "sync_repository", slug });
    if (gate.status !== "ok") return gate;
    const { outcome, attempted } = await importRepository(prisma, coreSubject(subject), { slug, approval });
    if (attempted) {
      settleRevalidate("repository-import", () => revalidatePath(`/projects/${slug}`, "layout"));
      settleRevalidate("repository-import", () => revalidatePath("/projects"));
      settleRevalidate("repository-import", () => revalidatePath("/projects/new"));
    }
    if (!outcome.ok) {
      if (outcome.error === "unavailable") return { status: "unavailable" };
      // Home의 Sync 결과와 같은 문장 — 그 화면이 고르는 사전이 먼저다(`m.repositorySync.errors`).
      const screen = pick(m.repositorySync.errors, outcome.error, "");
      // ⚠️ **코드 값 목록을 넓히지 않는다** (ux-drift-unify r1 · Q12와 같은 결) — 화면의 `unpinned`는 외부 계약에서 `not-connected`다. 문장은 화면 것이다.
      return { status: "refused", code: outcome.error === "unpinned" ? "not-connected" : outcome.error, ...(screen === "" ? {} : { message: screen }) };
    }
    // 불변식 9 — 표면별 결과(부분 실패·교체 안 됨)와 남은 미전달 편집을 그대로 싣는다.
    return ok({ sources: outcome.surfaces, remainingEdits: outcome.remainingEdits }, m.mcp.summary.synced(outcome.remainingEdits));
  },
});
