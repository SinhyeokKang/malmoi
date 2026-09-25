/**
 * `/api/push` 응답을 CI 로그 줄과 exit code로 옮긴다 (sync-edit-protection T16). `scripts/push-local.ts`가 출력만 한다.
 *
 * ⚠️ **보류는 200이고 exit 0이다** — 오류가 아니라 "앱에 미전달 편집이 있어 적재를 미뤘다"는 정상 결과이고, 대상 리포의 CI를
 * 우리 규칙으로 실패시키지 않는다(CLAUDE.md). 대신 Actions `::warning` 한 줄이 "적재됐다"는 오인을 막는다.
 * ⚠️ **`::warning` 줄에 서버 문자열을 싣지 않는다** — 정수 하나만 쓴다. 문자열을 실으면 개행·`::`로 워크플로 명령을 주입할 수 있다.
 * 구 action 태그(`@malmoi-i18n-push-v1`)의 CLI도 본문을 그대로 찍고 `res.ok`로 exit 0이라 보류가 안전하다 — 이 줄만 없다.
 */
export function reportPushResponse(status: number, text: string): { exitCode: 0 | 1; lines: string[] } {
  const lines = [`POST /api/push → ${status}`, text.slice(0, 800)];
  const ok = status >= 200 && status < 300;
  const pendingCount = ok ? deferredCount(text) : null;
  if (pendingCount !== null) {
    lines.push(`::warning title=Malmoi import deferred::${pendingCount} unsent translation change${pendingCount === 1 ? "" : "s"} in Malmoi — repository changes were not imported. Send them with Publish, then re-run this job.`);
  }
  return { exitCode: ok ? 0 : 1, lines };
}

function deferredCount(text: string): number | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { status, pendingCount } = body as { status?: unknown; pendingCount?: unknown };
  return status === "deferred" && typeof pendingCount === "number" && Number.isInteger(pendingCount) && pendingCount >= 0 ? pendingCount : null;
}
