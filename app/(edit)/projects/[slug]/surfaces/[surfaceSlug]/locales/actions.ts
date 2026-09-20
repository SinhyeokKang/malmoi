"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AccessError } from "@/lib/auth/message";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { recordEvent } from "@/lib/events/record";
import { planBaseLocaleChange } from "@/lib/onboarding/base-locale";
import type { RepositorySettingsError } from "@/lib/settings/message";

/**
 * 기준 로케일 — **`/projects/:slug/locales`가 소유한다** (6b-5 · PRODUCT §7.7 결정 4).
 *
 * ⚠️ **6b-3이 하루 전에 이것을 `updateRepositorySettings`와 한 Action에 뒀다.** 화면이 갈리면서
 * Action도 갈랐다: 인자를 optional로 만들면 서버가 "무엇을 안 보냈나"를 추측하게 되고, 그 추측이
 * 곧 malmoi#20의 모양이다 — 화면이 기본값으로 채운 값과 사람이 고른 값을 서버는 구별할 수 없다.
 *
 * ⚠️ **인가는 `project:settings`다.** 그 화면의 **페이지** 게이트는 `translation:write`이지만
 * (EDITOR도 목록과 orphaned 사유를 봐야 한다) 판정은 여기서 한다 — 6b-2가 멤버 화면에서 세운
 * 관용구이고, 노출을 차단으로 착각하면 그 차이가 구멍이 된다 (ARCHITECTURE §6.1).
 */

const Input = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), baseLocale: z.string().min(1) });

export type BaseLocaleResult =
  | { ok: true }
  | { ok: false; error: RepositorySettingsError | AccessError | "invalid input" };

/**
 * ⚠️ **선언 컬럼에만 쓴다.** `Project.baseLocale`(현실)은 push가 소유하고 pull이 그것을 읽으므로,
 * 여기서 현실을 바꾸면 야간 pull이 **옛 base의 원문을 새 base 파일에 실은 PR**을 낸다
 * (ARCHITECTURE §5.5.5가 그 안을 기각한 근거).
 *
 * ⚠️ **`Translation`·`StringKey`·`Locale.isBase`를 건드리지 않는다.** 재적재 경로는 CI 하나뿐이고
 * (`runFirstIngest`는 ready에서 `not-awaiting`), 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.
 */
export async function updateBaseLocale(raw: {
  slug: string;
  surfaceSlug: string;
  baseLocale: string;
}): Promise<BaseLocaleResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, surfaceSlug, baseLocale } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, {
    userId: session.userId,
    slug,
    surfaceSlug,
    permission: "project:settings",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId, surfaceId } = access;

  const outcome = await prisma.$transaction(async (tx) => {
    // CI와 같은 잠금 순서로 현실·선언을 함께 읽어야 오래된 값으로 이력을 만들지 않는다.
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;
    const project = await tx.translationSurface.findUnique({
      where: { id: surfaceId, projectId },
      select: { baseLocale: true, declaredBaseLocale: true, locales: { select: { code: true, orphaned: true } } },
    });
    if (project === null) return { ok: false, error: "not-found" } as const;
    const plan = planBaseLocaleChange({ current: project.baseLocale, next: baseLocale, locales: project.locales });
    if (plan === "unknown-locale" || plan === "orphaned-locale") return { ok: false, error: plan } as const;
    const declaredBaseLocale = plan === "ok" ? baseLocale : null;
    if (project.declaredBaseLocale === declaredBaseLocale) return { ok: true } as const;
    await tx.translationSurface.update({ where: { id: surfaceId, projectId }, data: { declaredBaseLocale } });
    await recordEvent(tx, {
      projectId,
      subtype: plan === "ok" ? "surface.baseLocaleDeclared" : "surface.baseLocaleDeclarationCleared",
      actor: { kind: "USER", userId: session.userId },
      surfaceIds: [surfaceId],
      // 선언을 다시 바꾸면 이전 선언이 before다 — 아직 적용되지 않은 현실로 되돌려 적지 않는다.
      payload: { kind: "SURFACE", surfaceSlug, adapter: null,
        baseLocale: { before: project.declaredBaseLocale ?? project.baseLocale, after: baseLocale } },
    });
    return { ok: true } as const;
  });
  if (!outcome.ok) return outcome;

  /**
   * ⚠️ **`declaredBaseLocale`을 읽는 화면이 셋이다**: 이 화면(필드 + 대기 Alert) · 번역 화면(배너) ·
   * **설정 화면**(워크플로 YAML이 대기 중 `base-locale:`을 박는다). 경로를 하나씩 나열하면 넷째
   * 소비자가 생길 때 조용히 빠지고, 그것이 POSTMORTEM 2026-09-09이 기록한 실패다 — 셋이 전부
   * `/projects/<slug>` 아래이므로 **그 세그먼트의 레이아웃**을 무효화한다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  return { ok: true };
}
