import "server-only";
import { z } from "zod";

import { en } from "@/messages/en";
import {
  addLocale, AddLocaleInput, cancelLocaleRemoval, CancelLocaleRemovalInput, previewLocaleRemoval, PreviewLocaleRemovalInput, removeLocale, RemoveLocaleInput,
  type LocaleChangeError,
} from "@/lib/locales/change";
import { redrawIfArchived, settleRevalidate } from "@/lib/revalidate-after-commit";
import { revalidatePath } from "next/cache";

import type { ToolOutcome } from "../result";
import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **언어 추가·제거·취소 넷** (locale-add design §6 — tasks §7). 웹 Action과 같은 코어(`lib/locales/change.ts`)의 형제 껍데기이고 Action을 부르지 않는다.
 * 소스 제거(`preview_source_detach` → `detach_source`)와 같은 미리보기 → 실행 형이다 — 제거·추가 취소는 미리보기의 서버 지문을 되돌려 받아야 하고,
 * 코어가 잠금 뒤 다시 계산해 대조한다. 파일 경로는 받지 않는다 — 서버가 소스 `pathTemplate`에서 계산한다(design §2).
 *
 * ⚠️ 입력 스키마는 코어의 것을 쓰고 길이 상한만 더한다(다른 도구의 slug 상한과 같은 값) — 복제하면 한쪽만 좁아진다. 코드 판정(`__proto__`·`../x`)은
 * 코어가 한다(`invalid-code`).
 */
const bounded = { slug: z.string().min(1).max(200), surfaceSlug: z.string().min(1).max(200), localeCode: z.string().min(1).max(200) };

/**
 * 거부 → 결과. 언어 변경의 거부 문장은 여기서만 싣는다 — `path-conflict`·`stale-approval` 같은 코드를 다른 도구가 다른 뜻으로 쓰므로 결과 경계의
 * 전역 조회에 두지 않는다. `not-found`도 언어 문장이다 — 입구가 프로젝트를 이미 확인했으니 여기의 not-found는 소스나 언어다.
 * 인가 거부(`forbidden`·`archived` …)와 `sync-running`은 문장이 없어 결과 경계가 공용 문장을 붙인다.
 */
function refused(error: LocaleChangeError): ToolOutcome {
  const messages: Readonly<Record<string, unknown>> = en.mcp.errors.languages;
  const message = Object.hasOwn(messages, error) ? messages[error] : undefined;
  return { status: "refused", code: error, ...(typeof message === "string" ? { message } : {}) };
}

/** 웹 Action과 같은 둘 — 소스 상세·번역 화면(프로젝트 레이아웃 아래)과 목록의 언어 수. */
function revalidateLanguages(slug: string): void {
  settleRevalidate("locale-change", () => {
    revalidatePath(`/projects/${slug}`, "layout");
    revalidatePath("/projects");
  });
}

export const addLocaleTool = defineTool({
  name: "add_locale",
  inputSchema: AddLocaleInput.extend(bounded),
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "add_locale", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await addLocale(prisma, coreSubject(subject), input);
    if (!result.ok) return redrawIfArchived(input.slug, result.error, refused(result.error));
    revalidateLanguages(input.slug);
    return ok({ language: input.localeCode, path: result.path, revived: result.action === "revive", reissuedEdits: result.reissued },
      en.mcp.summary.languageAdded(input.localeCode, result.path));
  },
});

export const previewLocaleRemovalTool = defineTool({
  name: "preview_locale_removal",
  inputSchema: PreviewLocaleRemovalInput.extend(bounded),
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "preview_locale_removal", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const preview = await previewLocaleRemoval(prisma, coreSubject(subject), input);
    if (!preview.ok) return refused(preview.error);
    // `delivered: null`은 확인이 무효화 중이라 모른다 — "보내지 않았다"로 접지 않는다.
    return ok({
      change: preview.kind === "cancel-add" ? "cancel-add" : "remove",
      path: preview.path, translations: preview.translations, unsentEdits: preview.pendingCount, delivered: preview.delivered, approval: preview.approval,
    }, en.mcp.summary.languageRemovalPreview(preview.kind, input.localeCode, preview.pendingCount));
  },
});

export const removeLocaleTool = defineTool({
  name: "remove_locale",
  // ⚠️ `approval`을 optional로 두지 않는다 — 코어는 승인을 항상 요구한다(`approval-required`). 빠진 필드를 서버가 추측하지 않는다.
  inputSchema: RemoveLocaleInput.extend({ ...bounded, approval: z.string().min(1).max(128).nullable() }),
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "remove_locale", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await removeLocale(prisma, coreSubject(subject), input);
    if (!result.ok) return redrawIfArchived(input.slug, result.error, refused(result.error));
    revalidateLanguages(input.slug);
    return ok({ language: input.localeCode, change: result.kind === "cancel-add" ? "cancel-add" : "remove", discardedEdits: result.discarded },
      en.mcp.summary.languageRemoved(result.kind, input.localeCode));
  },
});

export const cancelLocaleRemovalTool = defineTool({
  name: "cancel_locale_removal",
  inputSchema: CancelLocaleRemovalInput.extend(bounded),
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "cancel_locale_removal", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await cancelLocaleRemoval(prisma, coreSubject(subject), input);
    if (!result.ok) return redrawIfArchived(input.slug, result.error, refused(result.error));
    revalidateLanguages(input.slug);
    return ok({ language: input.localeCode, delivered: result.delivered }, en.mcp.summary.languageRemovalCancelled(input.localeCode, result.delivered));
  },
});
