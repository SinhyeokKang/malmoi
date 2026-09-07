import { requireUser } from "@/lib/auth/session";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * 새 프로젝트 온보딩 (SaaS 5단계 — design §2). **화면은 T7이 만든다** — 지금 여기 있는 것은
 * 라우트와 그 라우트가 지켜야 하는 성질 셋이다:
 *
 * 1. **`maxDuration`이 여기 있어야 한다.** Server Action에는 `app/api/*`의 세그먼트 config가 붙지
 *    않고, Action은 **자기를 부른 페이지 세그먼트**의 값을 쓴다 — design §3.1·§4의 예산(blob ≤21,
 *    첫 적재는 로케일 파일 수)이 전부 이 60초를 전제로 세운 것이다.
 * 2. **최상단에서 `requireUser`를 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과
 *    페이지를 병렬로 렌더해 페이지가 이미 실행된다 (POSTMORTEM 2026-08-31).
 * 3. **`?e=`를 두 union으로 읽는다.** callback이 `ConnectError`를 실어 보내고 Action은
 *    `OnboardError`를 낸다 — 한쪽만 보면 그 사유가 통째로 무음이고 사용자에게는 버튼이 안 눌린
 *    것으로 보인다 (POSTMORTEM 2026-09-06 · `/projects`가 같은 함정을 밟았다).
 *
 * ⚠️ 이 셋은 UI를 붙이기 전에 이미 실재해야 한다: 연결 왕복이 T6에서 이 경로로 착지하고,
 * `entry-points.test.ts`가 라우트·인가·`searchParams` 수신을 소스에서 센다.
 */
export const maxDuration = 60;

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  await requireUser();

  // 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시한다.
  const { e } = await searchParams;
  const message = isOnboardError(e)
    ? onboardErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      {message === null ? null : <p className="text-destructive text-sm">{message}</p>}
      <h1 className="text-sm font-medium">새 프로젝트</h1>
      <p className="text-muted-foreground text-xs">리포를 고르는 화면을 준비하고 있어요.</p>
    </main>
  );
}
