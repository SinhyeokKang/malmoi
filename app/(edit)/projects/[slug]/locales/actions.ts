"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { planBaseLocaleChange } from "@/lib/onboarding/base-locale";
import type { RepositorySettingsError } from "@/lib/settings/message";

/**
 * 기준 로케일 — **`/projects/:slug/locales`가 소유한다** (6b-5 · SAAS §7.7 결정 4).
 *
 * ⚠️ **6b-3이 하루 전에 이것을 `updateRepositorySettings`와 한 Action에 뒀다.** 화면이 갈리면서
 * Action도 갈랐다: 인자를 optional로 만들면 서버가 "무엇을 안 보냈나"를 추측하게 되고, 그 추측이
 * 곧 malmoi#20의 모양이다 — 화면이 기본값으로 채운 값과 사람이 고른 값을 서버는 구별할 수 없다.
 *
 * ⚠️ **인가는 `project:settings`다.** 그 화면의 **페이지** 게이트는 `translation:write`이지만
 * (EDITOR도 목록과 orphaned 사유를 봐야 한다) 판정은 여기서 한다 — 6b-2가 멤버 화면에서 세운
 * 관용구이고, 노출을 차단으로 착각하면 그 차이가 구멍이 된다 (ARCHITECTURE §6.1).
 */

const Input = z.object({ slug: z.string().min(1), baseLocale: z.string().min(1) });

export type BaseLocaleResult =
  | { ok: true }
  | { ok: false; error: RepositorySettingsError | AccessError | "invalid input" };

/**
 * ⚠️ **선언 컬럼에만 쓴다.** `Project.baseLocale`(현실)은 push가 소유하고 pull이 그것을 읽으므로,
 * 여기서 현실을 바꾸면 야간 pull이 **옛 base의 원문을 새 base 파일에 실은 PR**을 낸다
 * (design §3.13이 그 안을 기각한 근거).
 *
 * ⚠️ **`Translation`·`StringKey`·`Locale.isBase`를 건드리지 않는다.** 재적재 경로는 CI 하나뿐이고
 * (`runFirstIngest`는 ready에서 `not-awaiting`), 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.
 */
export async function updateBaseLocale(raw: {
  slug: string;
  baseLocale: string;
}): Promise<BaseLocaleResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, baseLocale } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId: session.userId,
    slug,
    permission: "project:settings",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // ⚠️ **인가가 준 projectId로 읽는다** — slug로 다시 찾으면 인가한 행과 조회한 행이 갈릴 수 있다.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      baseLocale: true,
      declaredBaseLocale: true,
      // 살아 있는 것만 보지 않는다 — `orphaned-locale`을 **거부 사유로 구별**해야 하고, 걸러 오면
      // 그 갈래가 `unknown-locale`로 뭉개진다 (`planBaseLocaleChange`).
      locales: { select: { code: true, orphaned: true } },
    },
  });
  // 인가와 조회 사이에 지워진 경우다 — 존재 여부를 말하지 않는 같은 갈래로 접는다.
  if (project === null) return { ok: false, error: "not-found" };

  const plan = planBaseLocaleChange({
    current: project.baseLocale,
    next: baseLocale,
    locales: project.locales,
  });
  if (plan === "unknown-locale" || plan === "orphaned-locale") return { ok: false, error: plan };

  if (plan === "ok") {
    await prisma.project.update({ where: { id: projectId }, data: { declaredBaseLocale: baseLocale } });
  } else if (project.declaredBaseLocale !== null) {
    /**
     * `noop`인데 선언이 남아 있다 — **되돌리는 경로다** (design §3.13: "B로 선언했다가 A로 다시
     * 저장하면 대기가 사라진다"). 별도 취소 버튼을 두지 않는 근거가 이 한 줄이고, `null`로 비우는
     * 것이 현실과 같은 값을 넣는 것보다 낫다 — `checkFormat`에 남는 예외가 아예 없다.
     */
    await prisma.project.update({ where: { id: projectId }, data: { declaredBaseLocale: null } });
  }
  // 나머지 `noop`은 쓸 것이 없다 — 빈 update는 `Project.updatedAt`만 올린다.

  /**
   * ⚠️ **`declaredBaseLocale`을 읽는 화면이 셋이다**: 이 화면(필드 + 대기 Alert) · 번역 화면(배너) ·
   * **설정 화면**(워크플로 YAML이 대기 중 `base-locale:`을 박는다). 경로를 하나씩 나열하면 넷째
   * 소비자가 생길 때 조용히 빠지고, 그것이 POSTMORTEM 2026-09-09이 기록한 실패다 — 셋이 전부
   * `/projects/<slug>` 아래이므로 **그 세그먼트의 레이아웃**을 무효화한다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  return { ok: true };
}
