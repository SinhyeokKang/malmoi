"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { SaveInput, planSave } from "@/lib/keys/save";
import type { PullOutcome } from "@/lib/pull/message";
import { triggerPull } from "@/lib/pull/trigger";

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

  // 로케일도 같은 프로젝트 것이어야 한다.
  // base 로케일도 편집 대상이다 — 고정된 것은 키뿐이다 (MVP §3.2).
  const locale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId: project.id, code: localeCode } },
    select: { code: true, orphaned: true },
  });
  if (!locale) return { ok: false, error: "locale not found in this project" };
  // 리포에서 사라진 로케일이면 이 값이 pull로 나갈 길이 없다. 저장을 받으면 `updatedAt`만 올라
  // pull이 헛돌고, 번역자는 반영될 것이라 믿는다. UI가 아직 그 열을 보여주는 것은 미결이다 (MVP §10).
  if (locale.orphaned) return { ok: false, error: "locale is no longer in the repo" };

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

/**
 * pull 트리거 — 편집 UI 버튼. **`/api/pull`을 fetch하지 않는다** (MVP §5): 내부 호출에
 * Route Handler를 끼우면 세션 쿠키·절대 URL 배선이 따라오고, 그 라우트는 cron 전용이다.
 *
 * ⚠️ Server Action은 공개 엔드포인트다 — 여기서도 인증을 스스로 한다. 다만 테넌트 격리는
 * `keyId` 같은 사용자 입력이 없어(대상이 `ACTIVE_PROJECT_SLUG` 하나다) 확인할 대상이 없다.
 *
 * **커밋 작성자는 항상 App 토큰이다.** 로그인한 사용자의 OAuth 토큰이 이 경로에 들어오지
 * 않는다 (ARCHITECTURE §6) — `triggerPull`이 `createGitClient`만 쓴다.
 *
 * ⚠️ **반환 형태가 `saveTranslation`과 다르다** (`{ok}` vs `{status}`). 의도된 것이다:
 * pull은 성공·스킵·실패 **3상태**라 `{ok: boolean}`에 담으면 스킵이 `{ok: true, skipped: true}`
 * 같은 파생 모양이 되고, `runPull`의 반환을 접었다 펴는 매핑이 층마다 생긴다. `PullResult`를
 * 그대로 흘리면 `pullMessage`의 exhaustive switch가 상태 누락을 컴파일 에러로 잡는다.
 * **새 Action은 사용자 mutation이면 `saveTranslation` 쪽을 따른다.**
 */
export async function triggerPullAction(): Promise<PullOutcome> {
  const session = await auth();
  if (!session?.user.login) return { status: "failed", error: "unauthorized" };

  const slug = requireEnv("ACTIVE_PROJECT_SLUG");
  try {
    return await triggerPull(getPrisma(), slug);
  } catch (error) {
    // 던지지 않는다 — 직렬화 경계라 클라이언트가 받을 수 있는 모양으로 바꾼다.
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
