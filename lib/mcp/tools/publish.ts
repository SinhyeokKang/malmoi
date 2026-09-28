import "server-only";
import { z } from "zod";

import { m } from "@/lib/i18n";
import { revalidateTranslationReaders } from "@/lib/keys/revalidate-readers";
import { loadPreview } from "@/lib/publish/load-preview";
import { planPublishView } from "@/lib/publish/plan";
import { publishProject } from "@/lib/sync/publish";

import type { ToolOutcome } from "../result";
import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **Publish 둘** (design §2.1 · §2.2 · §3.1). 미리보기가 **Publish 지문**을 주고 실행이 그것을 돌려받는다 — 실행권 뒤 같은 입력으로 다시 재서
 * 다르면 아무것도 보내지 않는다(`reconfirm`). EDITOR도 부를 수 있다(검토 가능한 PR 생성이다 — PRODUCT §3).
 *
 * 불변식 9 — 보류(`withheld`)·writer 경고·닫은 PR을 결과에 그대로 싣는다. 응답 유실 뒤 재호출은 서버 게이트(`already-running`·`too-soon`)가 막는다.
 */
const Slug = z.object({ slug: z.string().min(1).max(200) });

export const previewPublish = defineTool({
  name: "preview_publish",
  inputSchema: Slug,
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "preview_publish", slug });
    if (gate.status !== "ok") return gate;
    const result = await loadPreview(prisma, coreSubject(subject), { slug });
    if (result.status === "rejected") return { status: "refused", code: result.error };
    if (result.status === "failed") return { status: "unavailable" };
    if (result.status === "refused") {
      const copy = result.reason === "base-file-missing" ? m.translations.publish.baseFileMissing : m.translations.publish.baseFileUnreadable;
      return { status: "refused", code: result.reason, message: copy.description(result.path, result.branch) };
    }
    const { preview } = result;
    return ok({
      fingerprint: preview.fingerprint,
      sendable: preview.sendable,
      changedFiles: preview.changedFiles,
      unsent: { total: preview.total, keys: preview.keys, withoutFile: preview.withoutFile, withoutKey: preview.withoutKey },
      openPullRequest: preview.openPr ?? null,
      groups: preview.groups,
    }, m.mcp.summary.publishPreview(preview.sendable.total));
  },
});

export const publish = defineTool({
  name: "publish",
  inputSchema: Slug.extend({ fingerprint: z.string().min(1).max(256) }),
  async run({ prisma, subject }, { slug, fingerprint }) {
    const gate = await checkProjectTool(prisma, subject, { name: "publish", slug });
    if (gate.status !== "ok") return gate;
    const { outcome, attempted } = await publishProject(prisma, coreSubject(subject), { slug, expectedFingerprint: fingerprint });
    // 실행기에 닿았으면 스킵·실패에도 지운다 — 웹 Publish와 같은 셋이다(`triggerPullAction`).
    if (attempted) revalidateTranslationReaders(slug);
    return publishOutcome(outcome);
  },
});

function publishOutcome(outcome: Awaited<ReturnType<typeof publishProject>>["outcome"]): ToolOutcome {
  if (outcome.status === "skipped" && outcome.reason === "reconfirm") return { status: "refused", code: "reconfirm", message: m.logs.reasons.reconfirm };
  if (outcome.status === "failed") {
    if (outcome.error === "already-running") return { status: "refused", code: outcome.error, message: m.translations.publish.alreadyRunningBody };
    if (outcome.error === "too-soon") return { status: "refused", code: outcome.error, message: m.translations.publish.tooSoonBody };
    // 실행 실패는 거부가 아니라 장애일 수 있다 — `retryable`이면 장애로 접는다(§6.00 ②). 코드는 Logs가 말한다.
    if (outcome.retryable === true) return { status: "unavailable" };
    return { status: "refused", code: outcome.error };
  }
  const view = planPublishView(outcome);
  return ok({ result: view, outcome }, m.mcp.summary.published(view));
}
