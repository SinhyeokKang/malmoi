import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { logFailure } from "@/lib/github-connect/log";
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
    return publishOutcome(outcome, () => repoLabel(prisma, slug));
  },
});

/**
 * 설정 오류 문장의 리포 라벨. ⚠️ **실행은 이미 끝났다 — 이 조회가 실패해도 결과를 지우지 않는다**(Codex review CR-03 · POSTMORTEM 2026-09-20).
 * 던지면 `executeTool`이 전송 여부(`delivery`)·코드를 버린 일괄 `unavailable`로 접으므로, 실패는 slug 라벨로 떨어진다.
 */
async function repoLabel(prisma: PrismaClient, slug: string): Promise<{ label: string; branch: string }> {
  try {
    const project = await prisma.project.findUnique({ where: { slug }, select: { repoOwner: true, repoName: true, baseBranch: true } });
    return { label: project === null ? slug : `${project.repoOwner}/${project.repoName}`, branch: project?.baseBranch ?? "" };
  } catch (error) {
    logFailure("mcp-tool-publish-label", error);
    return { label: slug, branch: "" };
  }
}

/**
 * 실행 결과 → 도구 결과. 리포 라벨은 **그것을 쓰는 갈래(설정 오류)에서만** 조회한다 — 장애 응답이 보조 조회에 기대지 않게. ⚠️ **`error`는 코드가 아니다** — 실행기가 고른 safe 문장이거나 `internal (ref …)`다. 판정은 `code`(`SyncErrorCode`)와
 * `retryable`로 한다: 다시 해도 같은 실패(설정)는 Publish 화면의 `configError` 틀 + 서버의 safe 문장, 장애는 `unavailable` + 코드·전송 여부.
 */
async function publishOutcome(
  outcome: Awaited<ReturnType<typeof publishProject>>["outcome"],
  repoOf: () => Promise<{ label: string; branch: string }>,
): Promise<ToolOutcome> {
  if (outcome.status === "skipped" && outcome.reason === "reconfirm") return { status: "refused", code: "reconfirm", message: m.logs.reasons.reconfirm };
  if (outcome.status === "failed") {
    const delivery = outcome.delivery;
    if (outcome.error === "already-running") return { status: "refused", code: outcome.error, message: m.translations.publish.alreadyRunningBody, detail: { delivery } };
    if (outcome.error === "too-soon") {
      return { status: "refused", code: outcome.error, message: m.translations.publish.tooSoonBody,
        detail: { delivery, ...(outcome.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: outcome.retryAfterSeconds }) } };
    }
    if (outcome.code !== undefined) {
      // 장애 — 거부가 아니다(§6.00 ②). 문장은 싣지 않고(`internal (ref …)`일 수 있다) 코드·전송 여부만 싣는다. Logs가 같은 코드를 든다.
      if (outcome.retryable === true) return { status: "refused", code: "unavailable", detail: { code: outcome.code, delivery } };
      const p = m.translations.publish;
      const repo = await repoOf();
      return { status: "refused", code: outcome.code, message: `${p.configError}. ${p.configErrorDescription(repo.label, repo.branch)}`,
        detail: { reason: outcome.error, delivery } };
    }
    // 코드 없는 실패는 실행 전 거부다(잠금 뒤 인가·readiness) — 그 코드의 화면 문장이다.
    return { status: "refused", code: outcome.error, detail: { delivery } };
  }
  const view = planPublishView(outcome);
  return ok({ result: view, outcome }, m.mcp.summary.published(view));
}
