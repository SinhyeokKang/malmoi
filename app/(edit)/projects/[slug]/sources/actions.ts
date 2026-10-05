"use server";

import { getMessages } from "@/lib/i18n/server";
import { revalidateAfterCommit } from "@/lib/revalidate-after-commit";
import { loadSource } from "@/lib/sources/query";
import { logFailure } from "@/lib/github-connect/log";

import type { AccessError } from "@/lib/auth/message";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { BaseLocaleInput, declareBaseLocale } from "@/lib/sources/base-locale";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redrawIfArchived, settleRevalidate } from "@/lib/revalidate-after-commit";
import {
  PreviewSourceRemovalInput, previewSurfaceRemoval, RemoveSourceInput, removeSurface,
  type SourceRemovalError, type SourceRemovalPreview,
} from "@/lib/surfaces/remove";
import type { RepositorySettingsError } from "@/lib/settings/message";

/**
 * 기준 로케일 — **`/projects/:slug/sources`가 소유한다** (6b-5 · PRODUCT §7.7 결정 4).
 *
 * ⚠️ **6b-3이 하루 전에 이것을 `updateRepositorySettings`와 한 Action에 뒀다.** 화면이 갈리면서
 * Action도 갈랐다: 인자를 optional로 만들면 서버가 "무엇을 안 보냈나"를 추측하게 되고, 그 추측이
 * 곧 malmoi#20의 모양이다 — 화면이 기본값으로 채운 값과 사람이 고른 값을 서버는 구별할 수 없다.
 *
 * ⚠️ **인가는 `project:settings`다.** 그 화면의 **페이지** 게이트는 `translation:write`이지만
 * (EDITOR도 목록과 orphaned 사유를 봐야 한다) 판정은 여기서 한다 — 6b-2가 멤버 화면에서 세운
 * 관용구이고, 노출을 차단으로 착각하면 그 차이가 구멍이 된다 (ARCHITECTURE §6.1).
 */

export type BaseLocaleResult =
  | { ok: true }
  | { ok: false; error: RepositorySettingsError | AccessError | "invalid input" };

/**
 * 본체는 공유 코어 `declareBaseLocale`이다(MCP `set_base_locale`과 같다) — 선언 컬럼에만 쓰는 규칙이 거기 있다.
 */
export async function updateBaseLocale(raw: {
  slug: string;
  surfaceSlug: string;
  baseLocale: string;
}): Promise<BaseLocaleResult> {
  const parsed = BaseLocaleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const outcome = await declareBaseLocale(getPrisma(), { userId: session.userId }, parsed.data);
  if (!outcome.ok) return outcome;

  /**
   * ⚠️ **`declaredBaseLocale`을 읽는 화면이 셋이다**: 이 화면(필드 + 대기 Alert) · 번역 화면(배너) ·
   * **설정 화면**(워크플로 YAML이 대기 중 `base-locale:`을 박는다). 경로를 하나씩 나열하면 넷째
   * 소비자가 생길 때 조용히 빠지고, 그것이 POSTMORTEM 2026-09-09이 기록한 실패다 — 셋이 전부
   * `/projects/<slug>` 아래이므로 **그 세그먼트의 레이아웃**을 무효화한다.
   */
  revalidateAfterCommit("source-base-language", `/projects/${slug}`);
  return { ok: true };
}

export type SourceDetailResult = { ok: true; detail: import("@/lib/sources/query").SourceDetail } | { rejected: string } | { failed: true };
export async function loadSourceDetail(raw: { slug: string; surfaceSlug: string }): Promise<SourceDetailResult> {
  const m = await getMessages();
  if (!raw || typeof raw.slug !== "string" || !raw.slug || typeof raw.surfaceSlug !== "string" || !raw.surfaceSlug) return { rejected: "invalid input" };
  const session = await readSession();
  if (session.status === "none") return { rejected: "unauthorized" };
  if (session.status !== "ok") return { failed: true };
  try {
    const prisma = getPrisma();
    const access = await getSurfaceAccess(prisma, { userId: session.userId, slug: raw.slug, surfaceSlug: raw.surfaceSlug, permission: "translation:write" });
    if (access.status !== "ok") return { rejected: access.status };
    if (access.archived) return { rejected: "archived" };
    const detail = await loadSource(prisma, m, access.projectId, access.surfaceId, access.role);
    return detail === null ? { rejected: "not-found" } : { ok: true, detail };
  } catch (error) { logFailure("source-detail", error); return { failed: true }; }
}

export type RemoveSourceResult = { ok: true } | { ok: false; error: SourceRemovalError | "invalid input" };

/**
 * 소스 제거 (sources-add-remove — ARCHITECTURE §5.9). 본체는 공유 코어 `removeSurface`다(MCP `remove_source`와 같다).
 * ⚠️ **미전달이 있으면 `approval`이 `previewSourceRemoval`이 낸 지문이어야 한다** — 없거나 낡으면 `stale-approval`이고 아무것도 안 바뀐다.
 */
export async function removeSource(raw: { slug: string; surfaceSlug: string; approval: string | null }): Promise<RemoveSourceResult> {
  const parsed = RemoveSourceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const result = await removeSurface(getPrisma(), { userId: session.userId }, parsed.data);
  // 상태 때문에 거부했으면 화면을 다시 그린다 — 연 채로 보관된 Sources가 켜진 버튼으로 남지 않게(POSTMORTEM 2026-09-24).
  if (!result.ok) return redrawIfArchived(parsed.data.slug, result.error, result);
  /**
   * 소스 추가(`addSurfaces`)와 같은 둘이다 — 셸 소스 전환·Sources·Home·번역 화면이 그 프로젝트 레이아웃 아래이고, 목록의
   * 미전달 수가 제거된 소스를 빼고 다시 센다. 커밋 뒤 캐시 장애가 성공을 실패로 뒤집지 않는다.
   */
  settleRevalidate("source-remove", () => {
    revalidatePath(`/projects/${parsed.data.slug}`, "layout");
    revalidatePath("/projects");
  });
  return result;
}

/** 확인 창이 열릴 때 부른다 — **읽기만 한다**(`revalidatePath` 없음). 지문·미전달 수·열린 PR 여부를 준다. */
export async function previewSourceRemoval(raw: { slug: string; surfaceSlug: string }): Promise<SourceRemovalPreview | { ok: false; error: "invalid input" }> {
  const parsed = PreviewSourceRemovalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  try {
    return await previewSurfaceRemoval(getPrisma(), { userId: session.userId }, parsed.data);
  } catch (error) {
    logFailure("source-removal-preview", error);
    return { ok: false, error: "unavailable" };
  }
}
