import "server-only";
import { z } from "zod";

import { m } from "@/lib/i18n";
import { planImportConfirmation } from "@/lib/import/confirm";
import { prepareSync } from "@/lib/import/prepare";

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
