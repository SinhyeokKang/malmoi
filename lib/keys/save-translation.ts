import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ProjectAccess } from "@/lib/auth/access";
import type { Subject } from "@/lib/auth/subject";
import { isProjectReady } from "@/lib/projects/ready";
import { getSurfaceAccess } from "@/lib/surfaces/access";

import type { KeySaveInputType } from "./save";
import { applyKeySave, applyKeySaveBatch, type KeyBatchSaveResult, type KeySaveResult } from "./save-key";

/**
 * **번역 저장의 공유 코어** (mcp-connector T4-a). 편집 UI의 `saveTranslationKey`와 MCP의 `set_translations`가 같은 인가·readiness·
 * 잠금 tx를 지난다 — 세션·재검증은 호출자의 몫이라 여기 없다(design §3 "추출 경계").
 *
 * 도메인 거부(`unknown-locale` 등)와 접근 거부를 같은 `error` 자리에 싣고, DB 실패는 던진다 — 화면은 그것을 "저장 여부 확인 불가"로
 * 받는다(전혀 안 됐다고 단정하지 않는다).
 *
 * ⚠️ **거부 코드를 `string`으로 넓히지 않는다** (sync-lock) — `error: string` 갈래가 있으면 `error === "sync-running"`이 그 갈래를 좁히지 못해
 * 화면이 시각(`reopensBy`)을 못 읽고, 새 코드가 컴파일을 지나 일반 저장 실패로 조용히 접힌다.
 */
type EntryRefusal = { ok: false; error: Exclude<ProjectAccess["status"], "ok"> | "not-ready" };
/** Action 껍데기(`saveTranslationKey`)의 세션·입력 거부. */
type ActionRefusal = { ok: false; error: "unavailable" | "unauthorized" | "invalid input" };
export type KeySaveActionResult = KeySaveResult | EntryRefusal | ActionRefusal;

export async function saveTranslation(prisma: PrismaClient, subject: Subject, input: KeySaveInputType): Promise<KeySaveActionResult> {
  const { slug, surfaceSlug, keyId, changes } = input;
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (!(await isProjectReady(prisma, access.projectId))) return { ok: false, error: "not-ready" };
  return applyKeySave(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug, keyId, userId: subject.userId, credential: subject.credential, changes });
}

/** 여러 키를 한 잠금으로 — 상한·중복 키 거부는 호출자의 입력 검증이다(`applyKeySaveBatch`). */
export async function saveTranslationBatch(
  prisma: PrismaClient,
  subject: Subject,
  input: { slug: string; surfaceSlug: string; entries: readonly { keyId: string; changes: readonly { localeCode: string; value: string }[] }[] },
): Promise<KeyBatchSaveResult | EntryRefusal> {
  const { slug, surfaceSlug, entries } = input;
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (!(await isProjectReady(prisma, access.projectId))) return { ok: false, error: "not-ready" };
  return applyKeySaveBatch(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug, userId: subject.userId, credential: subject.credential, entries });
}
