"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { classifyFailure } from "@/lib/failure";
import { SaveInput, planSave } from "@/lib/keys/save";
import type { PullOutcome } from "@/lib/pull/message";
import { triggerPull } from "@/lib/pull/trigger";

/**
 * 번역값 저장과 Publish.
 *
 * ⚠️ **Server Action은 공개 엔드포인트다.** 클라이언트가 직접 호출할 수 있으므로 이 함수들이
 * 스스로 인증·인가·테넌트 격리를 전부 한다 — 미들웨어의 렌더 차단도 레이아웃도 지나지 않는다
 * (ARCHITECTURE §6.1). `app/__tests__/entry-points.test.ts`가 그 호출을 강제한다.
 *
 * ⚠️ **여기서 `redirect()`를 쓰지 않는다.** blur 저장 중의 redirect는 입력 중인 셀을 날린다 —
 * 거부는 결과값으로 돌려주고 화면이 `accessErrorMessage`로 문구를 정한다 (design §3).
 */

/** 거부 사유는 `AccessError`와 같은 문자열이다 — 화면이 한 곳에서 문구로 바꾼다. */
export type SaveResult = { ok: true; value: string } | { ok: false; error: string };

export async function saveTranslation(raw: unknown): Promise<SaveResult> {
  // `auth()`를 직접 부르지 않는다 — DB 장애가 "비로그인"으로 접힌다 (`lib/auth/read-session.ts`).
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  // 입력 검증이 인가보다 먼저다 — slug가 없으면 무엇을 인가할지 정할 수 없다.
  const parsed = SaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, keyId, localeCode, value } = parsed.data;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // ⚠️ **인가가 준 projectId로 다시 좁힌다** (CLAUDE.md 테넌트 규칙). 멤버십을 확인했다는 것은
  // "이 프로젝트에 들어올 자격"이지 "이 keyId가 그 프로젝트 것"이 아니다 — RLS가 없어
  // 애플리케이션이 유일한 방어선이다.
  const key = await prisma.stringKey.findFirst({
    where: { id: keyId, projectId },
    select: { id: true, orphaned: true },
  });
  if (!key) return { ok: false, error: "key not found in this project" };
  // 코드에서 사라진 키는 export가 빼므로 이 값이 리포에 도달할 길이 없다.
  if (key.orphaned) return { ok: false, error: "key is no longer in the code" };

  const locale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: localeCode } },
    select: { code: true, orphaned: true },
  });
  if (!locale) return { ok: false, error: "locale not found in this project" };
  // 리포에서 사라진 로케일이면 이 값이 pull로 나갈 길이 없다. 저장을 받으면 `updatedAt`만 올라
  // pull이 헛돌고, 번역자는 반영될 것이라 믿는다.
  if (locale.orphaned) return { ok: false, error: "locale is no longer in the repo" };

  const existing = await prisma.translation.findUnique({
    where: { keyId_localeCode: { keyId, localeCode } },
    select: { value: true },
  });
  const plan = planSave(existing?.value ?? null, value);
  if (plan.action === "noop") return { ok: true, value: existing?.value ?? "" };

  // 사용자가 저장했으면 검토가 끝난 것이므로 needsReview를 내린다.
  await prisma.translation.upsert({
    where: { keyId_localeCode: { keyId, localeCode } },
    create: { projectId, keyId, localeCode, value: plan.value, needsReview: false, updatedBy: userId },
    update: { value: plan.value, needsReview: false, updatedBy: userId },
  });

  revalidatePath(`/projects/${slug}/translations`);
  return { ok: true, value: plan.value };
}

/**
 * pull 트리거 — 편집 UI 버튼. **`/api/pull`을 fetch하지 않는다** (MVP §5): 내부 호출에
 * Route Handler를 끼우면 세션 쿠키·절대 URL 배선이 따라오고, 그 라우트는 cron 전용이다.
 *
 * **EDITOR도 부를 수 있다** — Publish는 base branch 직접 쓰기가 아니라 검토 가능한 PR 생성이다
 * (SAAS §3). 그래서 permission이 `translation:write`이고 별도 권한을 두지 않았다.
 *
 * **커밋 작성자는 항상 App 토큰이다.** 로그인한 사용자의 OAuth 토큰이 이 경로에 들어오지
 * 않는다 (ARCHITECTURE §6) — `triggerPull`이 `createGitClient`만 쓴다.
 *
 * ⚠️ **반환 형태가 `saveTranslation`과 다르다** (`{ok}` vs `{status}`). 의도된 것이다:
 * pull은 성공·스킵·실패 **3상태**라 `{ok: boolean}`에 담으면 스킵이 파생 모양이 되고,
 * `pullMessage`의 exhaustive switch가 상태 누락을 컴파일 에러로 잡는 장치를 잃는다.
 */
export async function triggerPullAction(slug: string): Promise<PullOutcome> {
  // 타입은 클라이언트를 구속하지 않는다 — 비문자열이 Prisma까지 가면 digest 오류가 된다 (ARCHITECTURE §6.3).
  if (typeof slug !== "string" || slug === "") return { status: "failed", error: "invalid input" };

  const session = await readSession();
  if (session.status === "unavailable") return { status: "failed", error: "unavailable" };
  if (session.status === "none") return { status: "failed", error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "translation:write" });
  if (access.status !== "ok") return { status: "failed", error: access.status };

  try {
    return await triggerPull(prisma, slug);
  } catch (error) {
    // 던지지 않는다 — 직렬화 경계라 클라이언트가 받을 수 있는 모양으로 바꾼다.
    // ⚠️ **남의 라이브러리 메시지는 싣지 않는다** — `/api/pull`과 같은 규칙이다 (ARCHITECTURE §6.0). 읽는 사람이
    // 외부 초대자이고, Prisma 접속 오류 한 줄이 pooler 호스트와 DB 유저를 담는다 (Codex 감사 2026-09-06 #7).
    const failure = classifyFailure(error);
    if (failure.safe) return { status: "failed", error: failure.message };
    const ref = randomUUID().slice(0, 8);
    console.error(`[pull:action] ${ref} ${failure.detail}`);
    return { status: "failed", error: `internal (ref ${ref})` };
  }
}
