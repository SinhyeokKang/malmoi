"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { SaveInput, planSave } from "@/lib/keys/save";

/**
 * 번역값 저장 — **MVP의 유일한 사용자 mutation** (MVP §3.2).
 *
 * ⚠️ **Server Action은 공개 엔드포인트다.** 클라이언트가 직접 호출할 수 있으므로 이 함수가
 * 스스로 인증·인가·테넌트 격리를 전부 해야 한다. 레이아웃이 페이지를 막아준다는 사실에
 * 의존하면 안 된다 — Action 호출은 그 레이아웃을 지나지 않는다.
 */

export type SaveResult = { ok: true; value: string } | { ok: false; error: string };

export async function saveTranslation(raw: unknown): Promise<SaveResult> {
  // 1) 인증. 세션이 있다는 것은 허용 목록을 통과했다는 뜻이다 (auth.ts의 signIn 콜백).
  const session = await auth();
  const login = session?.user.login;
  if (!login) return { ok: false, error: "unauthorized" };

  // 2) 입력 검증.
  const parsed = SaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { keyId, localeCode, value } = parsed.data;

  const prisma = getPrisma();
  const slug = requireEnv("ACTIVE_PROJECT_SLUG");
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) return { ok: false, error: "project not found" };

  // 3) ⚠️ **테넌트 격리 — 애플리케이션이 유일한 방어선이다** (CLAUDE.md).
  //    keyId가 활성 프로젝트 소속인지 확인하지 않으면 남의 테넌트 키를 수정할 수 있다.
  //    RLS가 없고 인가가 단일 테넌트라 이 확인이 빠지면 막는 것이 아무것도 없다.
  const key = await prisma.stringKey.findFirst({
    where: { id: keyId, projectId: project.id },
    select: { id: true },
  });
  if (!key) return { ok: false, error: "key not found in this project" };

  // 로케일도 같은 프로젝트 것이어야 한다. base 로케일은 원문 자체라 편집 대상이 아니다.
  const locale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId: project.id, code: localeCode } },
    select: { isBase: true },
  });
  if (!locale) return { ok: false, error: "locale not found in this project" };
  if (locale.isBase) return { ok: false, error: "base locale is not editable" };

  // 4) 판정 — 순수 함수가 한다.
  const existing = await prisma.translation.findUnique({
    where: { keyId_localeCode: { keyId, localeCode } },
    select: { value: true },
  });
  const plan = planSave(existing?.value ?? null, value);
  if (plan.action === "noop") return { ok: true, value: existing?.value ?? "" };

  // 5) 쓰기. 사용자가 저장했으면 검토가 끝난 것이므로 needsReview를 내린다.
  await prisma.translation.upsert({
    where: { keyId_localeCode: { keyId, localeCode } },
    create: {
      projectId: project.id,
      keyId,
      localeCode,
      value: plan.value,
      needsReview: false,
      updatedBy: login,
    },
    update: { value: plan.value, needsReview: false, updatedBy: login },
  });

  revalidatePath("/keys");
  return { ok: true, value: plan.value };
}
