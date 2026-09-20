"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getProjectAccess } from "@/lib/auth/query";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import type { NotStartedReason } from "@/lib/events/payload";
import { recordEvent } from "@/lib/events/record";
import { SaveInput, planSave } from "@/lib/keys/save";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import type { PullOutcome } from "@/lib/pull/message";
import { runSync } from "@/lib/sync/run";

/**
 * 번역값 저장과 Publish.
 *
 * ⚠️ **Server Action은 공개 엔드포인트다.** 클라이언트가 직접 호출할 수 있으므로 이 함수들이
 * 스스로 인증·인가·테넌트 격리를 전부 한다 — 미들웨어의 렌더 차단도 레이아웃도 지나지 않는다
 * (ARCHITECTURE §6.1). `app/__tests__/entry-points.test.ts`가 그 호출을 강제한다.
 *
 * ⚠️ **여기서 `redirect()`를 쓰지 않는다.** blur 저장 중의 redirect는 입력 중인 셀을 날린다 —
 * 거부는 결과값으로 돌려주고 화면이 `accessErrorMessage`로 문구를 정한다 (ARCHITECTURE §6.3).
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
  const { slug, surfaceSlug, keyId, localeCode, value } = parsed.data;

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, { userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId, surfaceId } = access;

  // 첫 적재 전에는 저장할 키가 없어 화면으로는 도달하지 않는다 — **URL 직접 호출**을 막는다
  // (PRODUCT §7.5). 판정을 `ProjectAccess` union에 넣지 않는 이유가 여기 있다: 넣으면
  // `ACCESS_ERRORS` Set을 손으로 늘리게 되고 컴파일러가 그것을 잇지 않는다.
  if (!(await isReady(prisma, projectId))) return { ok: false, error: "not-ready" };

  /**
   * ⚠️ **읽기·판정·저장·사건 기록이 한 트랜잭션이다** (logs-rework 완료조건 2). 전에는 트랜잭션
   * 밖에서 읽고 무조건 upsert했는데, 그러면 사건의 `before`가 **내 저장 직전 값이 아닐 수 있다** —
   * 이력이 거짓이 되는 부류다. 잠금 순서는 `Project` → `TranslationSurface`로 CI 적재·수동 Sync와
   * 맞춘다(`lib/push/apply.ts`) — 순서가 갈리면 교착이 난다.
   *
   * ⚠️ **나중 저장이 최종 값이 되는 동작은 그대로다.** 클라이언트 버전 비교나 충돌 거부 UI를
   * 넣지 않는다 — 같은 프로젝트의 저장이 짧게 직렬화되는 것이 그 대가다.
   *
   * ⚠️ **잠금 안에서 외부 API를 부르지 않는다.**
   */
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;

    // ⚠️ **인가가 준 projectId로 다시 좁힌다** (CLAUDE.md 테넌트 규칙). 멤버십을 확인했다는 것은
    // "이 프로젝트에 들어올 자격"이지 "이 keyId가 그 프로젝트 것"이 아니다 — RLS가 없어
    // 애플리케이션이 유일한 방어선이다.
    const key = await tx.stringKey.findFirst({
      where: { id: keyId, projectId, surfaceId },
      select: { id: true, key: true, orphaned: true },
    });
    if (!key) return { ok: false, error: "key not found in this project" } as const;
    // 코드에서 사라진 키는 export가 빼므로 이 값이 리포에 도달할 길이 없다.
    if (key.orphaned) return { ok: false, error: "key is no longer in the code" } as const;

    const locale = await tx.locale.findUnique({
      where: { projectId_surfaceId_code: { projectId, surfaceId, code: localeCode } },
      select: { code: true, orphaned: true },
    });
    if (!locale) return { ok: false, error: "locale not found in this project" } as const;
    // 리포에서 사라진 로케일이면 이 값이 pull로 나갈 길이 없다. 저장을 받으면 `updatedAt`만 올라
    // pull이 헛돌고, 번역자는 반영될 것이라 믿는다.
    if (locale.orphaned) return { ok: false, error: "locale is no longer in the repo" } as const;

    const existing = await tx.translation.findUnique({
      where: { keyId_localeCode: { keyId, localeCode }, projectId, surfaceId },
      select: { value: true },
    });
    const plan = planSave(existing?.value ?? null, value);
    // ⚠️ **no-op은 번역·편집 토큰·사건 셋 다 안 쓴다** (완료조건 3).
    if (plan.action === "noop") return { ok: true, value: existing?.value ?? "", changed: false } as const;

    // 사용자가 저장했으면 검토가 끝난 것이므로 needsReview를 내린다.
    // 편집 토큰은 값이 실제로 바뀐 이 갈래에서만 새로 쓴다 — no-op은 위에서 끝났다. Publish가 캡처한 토큰과 달라야
    // 전달 확인 CAS가 이 저장을 해제하지 않는다(같은 밀리초여도) (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`).
    const pendingEditToken = randomUUID();
    await tx.translation.upsert({
      where: { keyId_localeCode: { keyId, localeCode }, projectId, surfaceId },
      create: { projectId, surfaceId, keyId, localeCode, value: plan.value, needsReview: false, updatedBy: userId, pendingEditToken },
      update: { value: plan.value, needsReview: false, updatedBy: userId, pendingEditToken },
    });
    await recordEvent(tx, {
      projectId,
      subtype: "translation.saved",
      actor: { kind: "USER", userId },
      surfaceIds: [surfaceId],
      payload: {
        kind: "TRANSLATION",
        surfaceSlug,
        key: key.key,
        locale: localeCode,
        // 잠금 뒤에 읽은 값이다 — 그래서 `before`가 실제로 내가 덮은 값이다.
        before: existing?.value ?? null,
        after: plan.value,
      },
    });
    return { ok: true, value: plan.value, changed: true } as const;
  });

  if (!outcome.ok) return outcome;

  /**
   * ⚠️ **이 행을 읽는 화면이 셋이다**: 번역 화면 · 로케일 화면의 진행률(6b-5) · Home의 진행률과 최근
   * 활동(6b-6). 경로를 하나씩 나열하면 넷째 소비자가 조용히 빠지고, 그때 번역자가 저장한 값이 다른
   * 화면에서 옛 숫자로 남는다 — 쓰기는 성공했는데 화면이 거짓말을 하는 부류다
   * (POSTMORTEM 2026-09-09가 이 자리를 이름으로 적어 뒀다). 그래서 세그먼트 레이아웃을 무효화한다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  /**
   * ⚠️ **목록도 이 값을 읽는다** (DESIGN §6.63). 위가 **접두가 아니라 세그먼트**라 `/projects`를
   * 안 덮고, `/projects/new`는 모달 뒤에 같은 목록을 그리는 **또 다른 경로**다
   * (POSTMORTEM 2026-09-09). 저장 하나가 Summary의 `To review`·`To send`와 행의 Meter를 동시에
   * 움직이므로, 여기서 안 지우면 번역자가 저장한 값이 목록에서만 옛 숫자로 남는다.
   */
  revalidatePath("/projects");
  revalidatePath("/projects/new");
  return { ok: true, value: outcome.value };
}

/**
 * pull 트리거 — 편집 UI 버튼. **`/api/pull`을 fetch하지 않는다** (CLAUDE.md "데이터 변경 경로"): 내부 호출에
 * Route Handler를 끼우면 세션 쿠키·절대 URL 배선이 따라오고, 그 라우트는 cron 전용이다.
 *
 * **EDITOR도 부를 수 있다** — Publish는 base branch 직접 쓰기가 아니라 검토 가능한 PR 생성이다
 * (PRODUCT §3). 그래서 permission이 `translation:write`이고 별도 권한을 두지 않았다.
 *
 * **커밋 작성자는 항상 App 토큰이다.** 로그인한 사용자의 OAuth 토큰이 이 경로에 들어오지
 * 않는다 (ARCHITECTURE §6) — `triggerPull`이 `createGitClient`만 쓴다.
 *
 * ⚠️ **반환 형태가 `saveTranslation`과 다르다** (`{ok}` vs `{status}`). 의도된 것이다:
 * pull은 성공·스킵·실패 **3상태**라 `{ok: boolean}`에 담으면 스킵이 파생 모양이 되고,
 * `planPublishView`의 exhaustive switch가 상태 누락을 컴파일 에러로 잡는 장치를 잃는다.
 */
export async function triggerPullAction(slug: string): Promise<PullOutcome> {
  // 타입은 클라이언트를 구속하지 않는다 — 비문자열이 Prisma까지 가면 digest 오류가 된다 (ARCHITECTURE §6.3).
  if (typeof slug !== "string" || slug === "") return { status: "failed", error: "invalid input", delivery: "not-started", retryable: false };

  const session = await readSession();
  if (session.status === "unavailable") return { status: "failed", error: "unavailable", delivery: "not-started", retryable: true };
  if (session.status === "none") return { status: "failed", error: "unauthorized", delivery: "not-started", retryable: false };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "translation:write" });
  if (access.status !== "ok") {
    /**
     * ⚠️ **거부 여섯 중 여기서 기록하는 것은 `archived` 하나다** (logs-rework spec §6.1 — T5d).
     * 세션·멤버십 거부는 **payload가 주장하는 프로젝트에 아무것도 쓰지 않는다**: 인가되지 않은
     * 호출이 남의 프로젝트 이력에 줄을 하나 세울 수 있으면 그 자체가 쓰기 경로다.
     */
    if (access.status === "archived") await recordPublishRefusal(prisma, access.projectId, userId, "archived");
    return { status: "failed", error: access.status, delivery: "not-started", retryable: false };
  }

  // 첫 적재 전에는 내보낼 것이 없다 — `triggerPull`이 저장되지 않은 포맷으로 `fail()`하는 대신
  // 여기서 문구가 있는 사유로 거부한다 (PRODUCT §7.5).
  if (!(await isReady(prisma, access.projectId))) {
    await recordPublishRefusal(prisma, access.projectId, userId, "not-ready");
    return { status: "failed", error: "not-ready", delivery: "not-started", retryable: false };
  }

  /**
   * ⚠️ **`triggerPull`을 직접 부르지 않는다** (7단계). `runSync`가 게이트(동시 실행·최소 간격)·
   * `SyncRun` 행·오류 분류를 들고, **던지지 않는다** — 그래서 여기 있던 `try/catch`가 사라졌다.
   * 남의 라이브러리 메시지를 `ref`로 접는 규칙도 그쪽으로 함께 옮겨갔다(`publish-failure.test.ts`가
   * 이 경로로 그것을 계속 잰다).
   */
  const result = await runSync(prisma, {
    projectId: access.projectId,
    slug,
    trigger: "manual",
    requestedBy: userId,
  });
  /**
   * ⚠️ **Publish가 목록의 셋을 동시에 움직인다** (DESIGN §6.63): `lastPulledAt`이 전진해
   * `To send`와 `New from GitHub`의 기준이 바뀌고, `lastPrUrl`이 `pr_open` 띠를 세운다.
   * **스킵·실패에도 지운다** — 어느 쪽이든 목록이 보여 주던 값이 더 이상 최신이 아니고,
   * 성공만 지우면 "실패한 Publish 뒤에 옛 띠가 남는" 갈래가 생긴다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/projects/new");
  return result;
}

/**
 * **다음 번에도 같은 이유로 거부될 것만 남긴다** (결정 7). `already-running`·`too-soon`은 한 번 더
 * 누르면 사라지므로 이력에 없다 — `SyncRun`이 그 거부를 행으로 만들지 않는 기존 판정과 같다.
 *
 * ⚠️ **`scope: "project-wide"`다** — 거부는 소스를 고르기 전에 일어난다. 빈 배열을 `not-recorded`로
 * 두면 "모른다"가 되는데, 여기는 정말로 프로젝트 전체의 일이다.
 */
async function recordPublishRefusal(
  prisma: ReturnType<typeof getPrisma>,
  projectId: string,
  userId: string,
  refusal: NotStartedReason,
): Promise<void> {
  await recordEvent(prisma, {
    projectId,
    subtype: "publish.notStarted",
    actor: { kind: "USER", userId },
    result: "notStarted",
    scope: "project-wide",
    payload: { kind: "PUBLISH", surfaceSlugs: [], refusal },
  });
}

/**
 * `ready` 판정 — 컬럼을 만들지 않고 기존 두 컬럼으로 본다 (`planProjectReadiness`, PRODUCT §7.5).
 * **`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다** — `applyPush`가 그것을 키·번역·refs와
 * 한 배열형 트랜잭션에서 쓰므로 부분 성공 상태가 없다.
 *
 * ⚠️ **`projectId`로 좁힌다** — 인가가 돌려준 값이고, slug로 다시 찾으면 클라이언트 입력이 조회
 * 조건이 된다.
 */
async function isReady(prisma: ReturnType<typeof getPrisma>, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { installationId: true, surfaces: { select: { archivedAt: true, lastCommitSha: true } } },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 준비된 것으로 읽지 않는다.
  if (project === null) return false;
  return planProjectReadiness(project) === "ready";
}
