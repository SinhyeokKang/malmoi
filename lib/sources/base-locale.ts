import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { lockProjectAccess } from "@/lib/auth/lock";
import type { AccessError } from "@/lib/auth/message";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import { planBaseLocaleChange } from "@/lib/onboarding/base-locale";
import type { RepositorySettingsError } from "@/lib/settings/message";
import { getSurfaceAccess } from "@/lib/surfaces/access";

export const BaseLocaleInput = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), baseLocale: z.string().min(1) });

export type BaseLocaleDeclareResult = { ok: true } | { ok: false; error: RepositorySettingsError | AccessError };

/**
 * **기준 로케일 선언의 공유 코어** (mcp-connector T4-b). 편집 UI의 `updateBaseLocale`과 MCP `set_base_locale`이 같은 인가·잠금 tx·사건을
 * 지난다. ⚠️ **인가는 `project:settings`다** — Sources **페이지** 게이트는 `translation:write`지만 판정은 여기서 한다.
 *
 * ⚠️ **선언 컬럼에만 쓴다.** 현실(`baseLocale`)은 push가 소유하고 pull이 그것을 읽으므로, 여기서 현실을 바꾸면 야간 pull이 **옛 base의
 * 원문을 새 base 파일에 실은 PR**을 낸다(ARCHITECTURE §5.5.5). `Translation`·`StringKey`·`Locale.isBase`도 건드리지 않는다.
 */
export async function declareBaseLocale(prisma: PrismaClient, subject: Subject, input: z.infer<typeof BaseLocaleInput>): Promise<BaseLocaleDeclareResult> {
  const { slug, surfaceSlug, baseLocale } = input;
  const { userId, credential } = subject;
  const access = await getSurfaceAccess(prisma, { userId, slug, surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId, surfaceId } = access;

  return prisma.$transaction(async (tx) => {
    // CI와 같은 잠금 순서로 현실·선언을 함께 읽어야 오래된 값으로 이력을 만들지 않는다. 권한·보관도 잠금 뒤 다시 본다.
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "project:settings", surfaceId, credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
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
      actor: { kind: "USER", userId },
      surfaceIds: [surfaceId],
      // 선언을 다시 바꾸면 이전 선언이 before다 — 아직 적용되지 않은 현실로 되돌려 적지 않는다.
      payload: { kind: "SURFACE", surfaceSlug, adapter: null,
        baseLocale: { before: project.declaredBaseLocale ?? project.baseLocale, after: baseLocale } },
    });
    return { ok: true } as const;
  });
}
