"use server";

import { revalidatePath } from "next/cache";

import { getProjectAccess } from "@/lib/auth/query";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import type { NotStartedReason } from "@/lib/events/payload";
import { recordEvent } from "@/lib/events/record";
import { executeKeyRevert, previewKeyRevert, type RevertPreview, type RevertResult } from "@/lib/keys/revert";
import { KeySaveInput } from "@/lib/keys/save";
import { loadTranslationList, type TranslationListRow } from "@/lib/keys/translation-list";
import { applyKeySave, type KeySaveResult } from "@/lib/keys/save-key";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import type { PullOutcome } from "@/lib/pull/message";
import { runSync } from "@/lib/sync/run";
import { parseTranslationQuery } from "@/lib/translations/query";
import { z } from "zod";

/**
 * 번역값 저장과 Publish.
 *
 * ⚠️ **Server Action은 공개 엔드포인트다.** 클라이언트가 직접 호출할 수 있으므로 이 함수들이
 * 스스로 인증·인가·테넌트 격리를 전부 한다 — 미들웨어의 렌더 차단도 레이아웃도 지나지 않는다
 * (ARCHITECTURE §6.1). `app/__tests__/entry-points.test.ts`가 그 호출을 강제한다.
 *
 * ⚠️ **여기서 `redirect()`를 쓰지 않는다.** 저장 중의 redirect는 입력 중인 draft를 날린다 —
 * 거부는 결과값으로 돌려주고 화면이 `accessErrorMessage`로 문구를 정한다 (ARCHITECTURE §6.3).
 */

/**
 * **키 단위 저장** (translation-rework T10 — spec §3.4). 선택 키의 바뀐 로케일 전부를 한 트랜잭션으로 쓴다 — 본체는
 * `applyKeySave`이고 여기는 인증·인가·readiness·재검증만 든다. 도메인 거부(`unknown-locale` 등)와 접근 거부를 같은
 * `error` 자리에 싣고, DB 실패는 던진다 — 화면은 그것을 "저장 여부 확인 불가"로 받는다(전혀 안 됐다고 단정하지 않는다).
 */
export type KeySaveActionResult = KeySaveResult | { ok: false; error: string };

export async function saveTranslationKey(raw: unknown): Promise<KeySaveActionResult> {
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const parsed = KeySaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, surfaceSlug, keyId, changes } = parsed.data;

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, { userId: session.userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (!(await isReady(prisma, access.projectId))) return { ok: false, error: "not-ready" };

  const result = await applyKeySave(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug, keyId, userId: session.userId, changes });
  // no-op만 있던 저장은 아무것도 안 바꿨다 — 화면을 다시 그릴 이유가 없다.
  if (result.ok && result.cells.length > 0) revalidateTranslationReaders(slug);
  return result;
}

// 상한은 주소창 값의 합리적인 크기다 — 검색어(`Q_MAX_LENGTH` 200)·키 id·cursor(키 이름을 든다)를 넉넉히 덮고 그 이상은 조작이다.
const MoreInput = z.object({
  slug: z.string().min(1).max(200), surfaceSlug: z.string().min(1).max(200),
  query: z.record(z.string().max(64), z.string().max(1024)), cursor: z.string().min(1).max(2048),
});

/**
 * **키 목록의 다음 페이지** (audit-ux #19). 읽기 전용이다 — 그래서 `revalidatePath`가 없다(Revert 미리보기와 같다).
 * ⚠️ **cursor를 주소에 싣지 않으려고 Action이다** — 전엔 `?cursor=`로 페이지를 이동해 새로고침·공유·뒤로가기가 그 페이지만 보였고,
 * 키 선택이 cursor를 달고 다녔다. 행은 화면이 누적한다. 조건은 주소와 같은 해석(`parseTranslationQuery`)을 다시 지난다.
 */
export async function loadMoreTranslationKeys(raw: unknown): Promise<{ ok: true; rows: TranslationListRow[]; nextCursor: string | null } | { ok: false; error: string }> {
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const parsed = MoreInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, surfaceSlug, cursor } = parsed.data;

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, { userId: session.userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (!(await isReady(prisma, access.projectId))) return { ok: false, error: "not-ready" };
  // 선택 키·상세 언어는 페이지와 무관하다 — 목록 조건만 남긴다.
  const { key: _key, keySurface: _keySurface, language: _language, ...conditions } = parseTranslationQuery(parsed.data.query);
  const page = await loadTranslationList(prisma, { projectId: access.projectId, routeSurfaceId: access.surfaceId, query: { ...conditions, cursor } });
  return { ok: true, rows: page.rows, nextCursor: page.nextCursor };
}

const RevertInput = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), keyId: z.string().min(1) });
const RevertExecuteInput = RevertInput.extend({ confirmation: z.string().regex(/^[0-9a-f]{64}$/) });

type RevertAccessError = { status: "error"; error: string };

/**
 * **Revert 미리보기** (translation-rework T11 — spec §3.6). 읽기 전용이다 — 그래서 `revalidatePath`가 없다(Publish 미리보기와 같다).
 * ⚠️ **권한은 `project:settings`(OWNER)다** — EDITOR에게는 거부를 `blocked: forbidden`으로 돌려준다. 화면이 버튼을 숨기지 않고
 * 사유를 붙이는 계약이라, 접근 오류와 다른 자리에 싣는다.
 */
export async function previewTranslationRevert(raw: unknown): Promise<RevertPreview | RevertAccessError | { status: "blocked"; reason: "forbidden" }> {
  const session = await readSession();
  if (session.status === "unavailable") return { status: "error", error: "unavailable" };
  if (session.status === "none") return { status: "error", error: "unauthorized" };
  const parsed = RevertInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "invalid input" };
  const { slug, surfaceSlug, keyId } = parsed.data;

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, { userId: session.userId, slug, surfaceSlug, permission: "project:settings" });
  if (access.status === "forbidden") return { status: "blocked", reason: "forbidden" };
  if (access.status !== "ok") return { status: "error", error: access.status };
  if (!(await isReady(prisma, access.projectId))) return { status: "error", error: "not-ready" };
  return previewKeyRevert(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug, keyId, userId: session.userId });
}

/**
 * **Revert 실행**. 미리보기가 발급한 지문을 되돌려 받을 때만 쓴다 — 잠금 뒤 다시 재서 다르면 `reconfirm`이고 쓰기 0건이다.
 * DB 실패는 던진다 — 커밋 뒤 응답만 유실될 수 있으므로 화면은 "결과 미확인"으로 받고 같은 지문으로 재실행하지 않는다.
 */
export async function revertTranslationKey(raw: unknown): Promise<RevertResult | RevertAccessError | { status: "blocked"; reason: "forbidden" }> {
  const session = await readSession();
  if (session.status === "unavailable") return { status: "error", error: "unavailable" };
  if (session.status === "none") return { status: "error", error: "unauthorized" };
  const parsed = RevertExecuteInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "invalid input" };
  const { slug, surfaceSlug, keyId, confirmation } = parsed.data;

  const prisma = getPrisma();
  const access = await getSurfaceAccess(prisma, { userId: session.userId, slug, surfaceSlug, permission: "project:settings" });
  if (access.status === "forbidden") return { status: "blocked", reason: "forbidden" };
  if (access.status !== "ok") return { status: "error", error: access.status };
  if (!(await isReady(prisma, access.projectId))) return { status: "error", error: "not-ready" };

  const result = await executeKeyRevert(prisma, { projectId: access.projectId, surfaceId: access.surfaceId, surfaceSlug, keyId, userId: session.userId, confirmation });
  if (result.status === "reverted") revalidateTranslationReaders(slug);
  return result;
}

/**
 * 번역 값을 읽는 화면들 — 번역 화면·Sources 진행률·Home, 그리고 목록(`/projects`·`/projects/new`)이다.
 *
 * ⚠️ **경로를 하나씩 나열하지 않고 세그먼트 레이아웃을 무효화한다** — 나열하면 넷째 소비자가 조용히 빠지고, 저장은 성공했는데
 * 다른 화면이 옛 숫자로 남는다(POSTMORTEM 2026-09-09). 그 세그먼트가 `/projects`를 덮지 않고 `/projects/new`는 모달 뒤에 같은 목록을
 * 그리는 또 다른 경로라 둘을 따로 지운다.
 */
function revalidateTranslationReaders(slug: string): void {
  revalidatePath(`/projects/${slug}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/projects/new");
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
 * ⚠️ **반환 형태가 `saveTranslationKey`와 다르다** (`{ok}` vs `{status}`). 의도된 것이다:
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
