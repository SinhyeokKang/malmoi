"use server";

import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadMoreKeys, MoreInput, type MoreKeysResult } from "@/lib/keys/load-more";
import type { RevertPreview, RevertResult } from "@/lib/keys/revert";
import { previewRevert, RevertExecuteInput, RevertInput, runRevert, type RevertAccessError } from "@/lib/keys/revert-translation";
import { revalidateTranslationReaders } from "@/lib/keys/revalidate-readers";
import { KeySaveInput } from "@/lib/keys/save";
import { saveTranslation, type KeySaveActionResult } from "@/lib/keys/save-translation";
import type { PullOutcome } from "@/lib/pull/message";
import { publishProject } from "@/lib/sync/publish";

/**
 * 번역값 저장과 Publish.
 *
 * ⚠️ **Server Action은 공개 엔드포인트다.** 클라이언트가 직접 호출할 수 있으므로 이 함수들이
 * 스스로 인증하고, 인가·테넌트 격리는 공유 코어(`lib/keys/*` · `lib/sync/publish.ts`)가 한다 — 미들웨어의 렌더 차단도 레이아웃도
 * 지나지 않는다 (ARCHITECTURE §6.1). `app/__tests__/entry-points.test.ts`가 Action → 코어 → 가드 두 홉을 강제한다.
 *
 * ⚠️ **여기서 `redirect()`를 쓰지 않는다.** 저장 중의 redirect는 입력 중인 draft를 날린다 —
 * 거부는 결과값으로 돌려주고 화면이 `accessErrorMessage`로 문구를 정한다 (ARCHITECTURE §6.3).
 */

/**
 * **키 단위 저장** (translation-rework T10 — spec §3.4). 본체는 공유 코어 `saveTranslation`이고(MCP `set_translations`와 같다) 여기는
 * 세션·입력 검증·재검증만 든다.
 */
export async function saveTranslationKey(raw: unknown): Promise<KeySaveActionResult> {
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const parsed = KeySaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const result = await saveTranslation(getPrisma(), { userId: session.userId }, parsed.data);
  // no-op만 있던 저장은 아무것도 안 바꿨다 — 화면을 다시 그릴 이유가 없다.
  if (result.ok && result.cells.length > 0) revalidateTranslationReaders(parsed.data.slug);
  return result;
}

/**
 * **키 목록의 다음 페이지** (audit-ux #19). 읽기 전용이다 — 그래서 `revalidatePath`가 없다(Revert 미리보기와 같다).
 * ⚠️ **cursor를 주소에 싣지 않으려고 Action이다** — 전엔 `?cursor=`로 페이지를 이동해 새로고침·공유·뒤로가기가 그 페이지만 보였고,
 * 키 선택이 cursor를 달고 다녔다. 행은 화면이 누적한다.
 */
export async function loadMoreTranslationKeys(raw: unknown): Promise<MoreKeysResult> {
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const parsed = MoreInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  return loadMoreKeys(getPrisma(), { userId: session.userId }, parsed.data);
}

/**
 * **Revert 미리보기** (translation-rework T11 — spec §3.6). 읽기 전용이다 — 그래서 `revalidatePath`가 없다(Publish 미리보기와 같다).
 * EDITOR의 거부는 `blocked: forbidden`이다(`previewRevert`).
 */
export async function previewTranslationRevert(raw: unknown): Promise<RevertPreview | RevertAccessError | { status: "blocked"; reason: "forbidden" }> {
  const session = await readSession();
  if (session.status === "unavailable") return { status: "error", error: "unavailable" };
  if (session.status === "none") return { status: "error", error: "unauthorized" };
  const parsed = RevertInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "invalid input" };
  return previewRevert(getPrisma(), { userId: session.userId }, parsed.data);
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

  const result = await runRevert(getPrisma(), { userId: session.userId }, parsed.data);
  if (result.status === "reverted") revalidateTranslationReaders(parsed.data.slug);
  return result;
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

  const { outcome, attempted } = await publishProject(getPrisma(), { userId: session.userId }, { slug });
  if (!attempted) return outcome;
  /**
   * ⚠️ **Publish가 목록의 셋을 동시에 움직인다** (DESIGN §6.63): `lastPulledAt`이 전진해
   * `To send`와 `New from GitHub`의 기준이 바뀌고, `lastPrUrl`이 `pr_open` 띠를 세운다.
   * **스킵·실패에도 지운다** — 어느 쪽이든 목록이 보여 주던 값이 더 이상 최신이 아니고,
   * 성공만 지우면 "실패한 Publish 뒤에 옛 띠가 남는" 갈래가 생긴다. 지우는 경로는 저장과 같은 셋이다.
   */
  revalidateTranslationReaders(slug);
  return outcome;
}
