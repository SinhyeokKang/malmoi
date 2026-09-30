import "server-only";
import { z } from "zod";

import { m } from "@/lib/i18n";
import { previewRevert, RevertInput } from "@/lib/keys/revert-translation";
import { loadTranslationDetail, loadTranslationList } from "@/lib/keys/translation-list";
import { isProjectReady } from "@/lib/projects/ready";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { parseTranslationQuery } from "@/lib/translations/query";

import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * 표면 축 읽기 셋 (design §2.1). 표면 조회는 인가된 프로젝트의 표면으로 좁힌다(`getSurfaceAccess`). readiness는 화면과 같은 판정이다 —
 * 첫 적재 전에는 볼 것이 없다.
 */

/**
 * 목록 조건은 번역 화면 주소와 같은 해석(`parseTranslationQuery`)이다 — `scope`가 없으면 화면처럼 전 소스다(translation-filter-scope).
 * ⚠️ **cursor 페이징은 이 도구의 외부 계약이다** — 화면은 전량을 한 번에 싣지만 도구는 `pageSize`·`nextCursor`를 그대로 둔다.
 * 상한은 주소창 값의 합리적인 크기다 — 검색어(`Q_MAX_LENGTH` 200)·키 id·cursor(키 이름을 든다)를 넉넉히 덮고 그 이상은 조작이다.
 */
const ListKeysInput = z.object({
  slug: z.string().min(1).max(200), surfaceSlug: z.string().min(1).max(200),
  query: z.record(z.string().max(64), z.string().max(1024)).optional(), cursor: z.string().min(1).max(2048).optional(),
});

export const listKeys = defineTool({
  name: "list_keys",
  inputSchema: ListKeysInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "list_keys", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "translation:write" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    if (!(await isProjectReady(prisma, access.projectId))) return { status: "refused", code: "not-ready" };
    // 선택 키·상세 언어는 목록과 무관하다 — 목록 조건만 남긴다.
    const { key: _key, keySurface: _keySurface, language: _language, ...conditions } = parseTranslationQuery(input.query ?? {});
    const page = await loadTranslationList(prisma, { projectId: access.projectId, routeSurfaceId: access.surfaceId, query: { ...conditions, cursor: input.cursor } });
    return ok({
      keys: page.rows,
      matchedKeyCount: page.matchedKeyCount,
      incompleteKeyCount: page.incompleteKeyCount,
      nextCursor: page.nextCursor,
    }, m.mcp.summary.keys(page.rows.length, page.matchedKeyCount));
  },
});

export const getKey = defineTool({
  name: "get_key",
  inputSchema: RevertInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "get_key", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "translation:write" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    if (!(await isProjectReady(prisma, access.projectId))) return { status: "refused", code: "not-ready" };
    const detail = await loadTranslationDetail(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, keyId: input.keyId });
    if (detail.status !== "ok") return { status: "refused", code: "not-found" };
    return ok({
      key: detail.key,
      refs: detail.refs,
      // ⚠️ `updatedBy`는 원문 사용자 id라 싣지 않는다 — 화면도 마스킹 라벨로 바꾼 뒤에만 낸다. 미전달 토큰은 원래 boolean 투영뿐이다.
      locales: detail.locales.map(({ updatedBy: _updatedBy, updatedAt, ...cell }) => ({ ...cell, updatedAt: updatedAt?.toISOString() ?? null })),
    }, m.mcp.summary.key(detail.key.key));
  },
});

export const previewRevertTool = defineTool({
  name: "preview_revert",
  inputSchema: RevertInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "preview_revert", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const preview = await previewRevert(prisma, coreSubject(subject), input);
    if (preview.status === "error") return { status: "refused", code: preview.error };
    // 막힌 갈래는 거부가 아니라 미리보기의 답이다 — 무엇이 막는지를 값으로 싣는다(확인값 없음).
    if (preview.status === "blocked") return ok({ revertable: false, reason: preview.reason, ...("localeCodes" in preview ? { localeCodes: preview.localeCodes } : {}) }, m.mcp.summary.revertBlocked);
    // 확인값은 `revert_to_last_sent`가 소비한다 — 실행은 역할·쓰기 grant·잠금 뒤 재측정을 다시 지난다(읽기 토큰의 핸들로는 못 쓴다).
    return ok({ revertable: true, locales: preview.locales, confirmation: preview.confirmation }, m.mcp.summary.revertReady(preview.locales.length));
  },
});
