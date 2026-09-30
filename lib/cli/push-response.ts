/**
 * `/api/push` 응답을 CI 로그 줄과 exit code로 옮긴다 (sync-edit-protection T16). `scripts/push-local.ts`가 출력만 한다.
 *
 * ⚠️ **보류는 200이고 exit 0이다** — 오류가 아니라 "앱에 미전달 편집이 있어 적재를 미뤘다"는 정상 결과이고, 대상 리포의 CI를
 * 우리 규칙으로 실패시키지 않는다(CLAUDE.md). 대신 Actions `::warning` 한 줄이 "적재됐다"는 오인을 막는다.
 * ⚠️ **`::warning` 줄에 서버 문자열을 싣지 않는다** — 정수 하나만 쓴다. 문자열을 실으면 개행·`::`로 워크플로 명령을 주입할 수 있다.
 * ⚠️ **Publish만 가리키지 않는다** (#129) — 파일·키 자리가 없어 보류된 편집은 Publish로 안 나가고(B3.1·B3.4), 서버는 어느 편집이 보류인지 모른다(렌더 시점
 * 판정이다). 응답 계약(`pendingCount`)을 늘리지 않고 두 길을 다 말한다.
 * 구 action 태그(`@malmoi-i18n-push-v1`)의 CLI도 본문을 그대로 찍고 `res.ok`로 exit 0이라 보류가 안전하다 — 이 줄만 없다.
 * ⚠️ **열린 PR 보류(`open-pr`·`pr-check-failed`)는 v3부터 경고한다** — v2 CLI는 `pendingCount`가 정수일 때만 경고해 이 사유에선 경고 없이 green이다.
 */
export function reportPushResponse(status: number, text: string): { exitCode: 0 | 1; lines: string[] } {
  const lines = [`POST /api/push → ${status}`, text.slice(0, 800)];
  const ok = status >= 200 && status < 300;
  const held = ok ? deferral(text) : null;
  if (held === null) return { exitCode: ok ? 0 : 1, lines };
  if (held.reason === "open-pr") {
    lines.push("::warning title=Malmoi import deferred::a Malmoi pull request is still open — repository changes were not imported, so the translations in it aren't overwritten. Review the pull request and merge or close it; the next push or the nightly sync imports these changes.");
  } else if (held.reason === "pr-check-failed") {
    lines.push("::warning title=Malmoi import deferred::couldn't check whether the Malmoi pull request is still open — repository changes were not imported. Re-run this job later.");
  } else {
    const { pendingCount } = held;
    lines.push(`::warning title=Malmoi import deferred::${pendingCount} unsent translation change${pendingCount === 1 ? "" : "s"} in Malmoi — repository changes were not imported. Send them with Publish in Malmoi. For edits Publish can't send (their file or key is missing from the repository), add the file or key back to the repository, or discard them with Sync (or Revert to last sent where available). Then re-run this job.`);
  }
  return { exitCode: ok ? 0 : 1, lines };
}

/**
 * 보류 응답의 사유. **허용 목록으로만 읽는다** — 서버 문자열을 해석·출력하지 않는다.
 * 열린 PR 게이트(nightly-sync)의 두 사유는 `pendingCount`가 없다 — 수를 요구하면 경고가 사라지고, 0을 채우면 거짓 "0 unsent"다.
 * 그 밖(`pending-edits`·`reason` 없는 옛 모양·모르는 값)은 v2와 같이 **정수 `pendingCount`가 있을 때만** 미전달 보류로 읽는다 — 경고 문구엔 그 정수만 실린다.
 */
function deferral(text: string): { reason: "open-pr" } | { reason: "pr-check-failed" } | { reason: "pending-edits"; pendingCount: number } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { status, reason, pendingCount } = body as { status?: unknown; reason?: unknown; pendingCount?: unknown };
  if (status !== "deferred") return null;
  if (reason === "open-pr") return { reason: "open-pr" };
  if (reason === "pr-check-failed") return { reason: "pr-check-failed" };
  return typeof pendingCount === "number" && Number.isInteger(pendingCount) && pendingCount >= 0 ? { reason: "pending-edits", pendingCount } : null;
}
