"use client";

import { ArrowDownToLine } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { useMessages } from "@/components/i18n/messages-provider";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { planImportRefusal } from "@/lib/import/refusal";
import { summarizeImport, type RepositoryImportOutcome, type RepositoryImportError, type SurfaceImportReason } from "@/lib/import/result";
import { onboardErrorMessage, isOnboardError } from "@/lib/onboarding/message";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { routes } from "@/lib/routes";
import type { Messages } from "@/lib/i18n";

/**
 * ⚠️ **화면 전용 문구를 먼저 본다** — `not-ready`·`not-connected`는 온보딩·연결 사전에도 있지만
 * 그쪽 문장이 그 화면의 컨트롤을 가리킨다("use Authorize GitHub App below"). 여기엔 그 아래가 없다.
 */
function reasonMessage(m: Messages, reason: RepositoryImportError | SurfaceImportReason): string {
  if (Object.hasOwn(m.repositorySync.errors, reason)) return m.repositorySync.errors[reason as keyof typeof m.repositorySync.errors];
  if (isAccessError(reason)) return accessErrorMessage(m, reason);
  if (isOnboardError(reason)) return onboardErrorMessage(m, reason);
  if (isConnectError(reason)) return connectErrorMessage(m, reason);
  if (isImportFailureCode(reason)) return importFailureMessage(m, reason);
  return m.projects.importFailure.importFailed;
}

/**
 * Sync Dialog **결과 단계의 제목** (sync-lock R6 — Publish 모달 §6.646과 같은 형). 제목은 결과의 종류이고 본문 Alert 헤드라인이 내용이다 —
 * 같은 문장이 두 번 서지 않는다. ⚠️ 판정은 헤드라인과 같은 재료(`summarizeImport`)라 둘이 어긋나지 않는다.
 */
/**
 * 실행 전 거부 — 세션·입력(Action 껍데기) · 인가(`isAccessError`) · `acquire`의 판정(`planSyncStart` · 식별 · 폐기 지문). 여기 없는 거부는 단계를
 * 모른다(`unavailable`은 세션 저장소와 저장소 접근 둘에서, `ingest-failed`는 lease 뒤 바깥 catch에서 나온다).
 */
const PRE_RUN: ReadonlySet<string> = new Set(["reconfirm", "already-running", "unauthorized", "invalid input", "not-ready", "no-surfaces", "unpinned", "repo-replaced"]);
export function syncResultTitle(m: Messages, outcome: RepositoryImportOutcome): string {
  const t = m.repositorySync.resultTitle;
  if (!outcome.ok) {
    if (outcome.error === "unconfirmed") return t.unknown;
    return PRE_RUN.has(outcome.error) || (isAccessError(outcome.error) && outcome.error !== "unavailable") ? t.didntRun : t.failed;
  }
  const summary = summarizeImport(outcome.surfaces);
  if (summary.imported + summary.partial === 0) return t.nothingReplaced;
  return summary.tone === "success" && outcome.remainingEdits === 0 ? t.complete : t.issues;
}

/**
 * Sync Dialog 본문에 서는 **결과와 거부** (시안 `4e`·`4f` · sync-lock S5). 한 번에 하나만 선다. 전엔 Home·번역 화면의 띠 Alert였고
 * Dialog로 옮겼다(DESIGN §6.644) — 형·문장·톤은 그대로다.
 *
 * ⚠️ **형이 둘이고 그것이 방어다** — 성공은 **한 줄**(헤드라인뿐)이고 표면별 사고만 **두 줄**(헤드라인 +
 * 원인)이다. 색만 다르면 `Synced …`라는 앞머리가 같아 스캔에서 성공으로 읽힌다 — 높이와 줄 수가
 * 달라야 **읽지 않아도** 다른 결과임이 보인다. 불변식 9(버린 값을 성공으로 숨기지 않는다)가 문구가
 * 아니라 **형**에도 산다.
 *
 * ⚠️ **성공한 표면을 나열하지 않는다** — 목록이 서면 정상 결과도 두 줄이 되어 위 구별이 사라진다.
 * ⚠️ **표면 이름은 헤드라인이 아니라 원인 줄에 산다** (DESIGN §6.644) — 셋 이상이면 헤드라인이 무너지고,
 * 이름이 아예 없으면 어디를 고쳐야 하는지가 화면에 없다.
 *
 * ⚠️ **진행은 이 Alert가 아니라 Dialog의 확정 버튼이 든다** (sync-lock — 2026-09-16 정본을 뒤집었다). 옛 근거("진행 Alert를 세웠다가
 * 결과로 바꾸면 같은 자리에서 뜻이 두 번 바뀐다")는 **띠**의 것이었다 — Dialog에서 확인 → 진행 → 결과는 한 동작의 단계라 Publish 모달
 * (§6.646)과 같은 형이다. 그래도 진행 Alert는 세우지 않는다: 진행은 확정 버튼의 스피너, 결과만 이 Alert다.
 */
export function SyncResult({ outcome, slug, branch, role = "OWNER", onRetry }: {
  outcome: RepositoryImportOutcome | null;
  slug: string;
  branch: string;
  /**
   * ⚠️ **설정으로 보내는 액션은 OWNER에게만 선다** (malmoi#85) — Settings는 `project:settings` 뒤라 EDITOR가 누르면
   * 거절당한다. 기본값이 OWNER인 이유: `[Sync]` 자체가 OWNER 전용이라 지금 EDITOR가 결과를 가질 경로가 없다.
   */
  role?: "OWNER" | "EDITOR";
  /**
   * 읽기 실패·`superseded`와, 다시 확인하면 풀릴 수 있는 거부(`reconfirm`·`already-running`·`unavailable`·`ingest-failed`)에 선다.
   * Sync Dialog에서는 같은 Dialog를 확인 단계로 되돌린다 — 실행하지 않는다.
   */
  onRetry?: () => void;
}) {
  const m = useMessages();
  if (outcome === null) return null;
  if (!outcome.ok) {
    const refusal = planImportRefusal(outcome.error);
    const owner = role === "OWNER";
    // 온보딩 문장을 빌리지 않는다 (malmoi#85) — 없는 것은 리포의 기본 브랜치가 아니라 설정된 base branch다.
    const title = outcome.error === "base-branch-missing"
      ? (owner ? m.repositorySync.baseBranchMissing.owner(branch) : m.repositorySync.baseBranchMissing.editor(branch))
      // 제목이 사실을 말하는 Dialog라 헤드라인은 다음 행동이다(R6 r2) — 그 밖의 거부는 `errors` 문장 그대로다.
      : Object.hasOwn(m.repositorySync.resultHeadline, outcome.error) ? m.repositorySync.resultHeadline[outcome.error as keyof typeof m.repositorySync.resultHeadline]
      : reasonMessage(m, outcome.error);
    const action = !owner && (refusal.action === "settings" || refusal.action === "reconnect") ? null : refusal.action;
    /*
      ⚠️ **닫을 수 있고 갈 곳이 없는 거부만 [Try again]을 든다** — `dismissible`이 이미 "다시 눌러 다른 답이 날 수 있나"의 판정이다.
      `unconfirmed`는 뺀다: 서버가 끝냈을 수 있어 다시 돌리면 두 번 돈다(malmoi#132). 다음 행동은 다시 읽은 화면·Logs가 든다.
    */
    const retryRefusal = onRetry !== undefined && action === null && refusal.dismissible && outcome.error !== "unconfirmed";
    return <Alert variant={refusal.tone} live={refusal.tone === "danger" ? "alert" : "status"} title={title}
      actions={action === null ? (retryRefusal ? <Button onClick={onRetry}><ArrowDownToLine className="size-3.5" aria-hidden />{m.common.retry}</Button> : undefined)
        /*
          ⚠️ **로그인은 새 탭이다** (QA D2) — 같은 화면의 편집자 세션 Alert와 같은 형. 이 탭을 떠나면 번역 화면의 draft가
          함께 사라진다. `ButtonLink external newTab`이 native 새 탭 이동을 유지한다(DESIGN §6.3).
        */
        : action === "sign-in"
          ? <ButtonLink external href={routes.signIn()} newTab rel="noreferrer">{m.repositorySync.signIn}</ButtonLink>
          : action === "account"
            ? <ButtonLink href={routes.account()}>{m.repositorySync.openAccount}</ButtonLink>
            : <ButtonLink href={routes.settings(slug)}>{action === "settings" ? m.repositorySync.openSettings : m.repositorySync.reconnect}</ButtonLink>} />;
  }
  const summary = summarizeImport(outcome.surfaces);
  /*
    ⚠️ **승인 뒤 남은 편집은 성공 한 줄에 숨기지 않는다** (sync-edit-protection T9 · POSTMORTEM 2026-09-16) — 남아 있는 한
    자동 적재가 멈춘다. `partial`과 같은 형(warning · 브랜치 없는 헤드라인 · 원인 줄)으로 선다.
  */
  const kept = outcome.remainingEdits;
  const tone = kept > 0 && summary.tone === "success" ? "warning" : summary.tone;
  const replaced = summary.imported + summary.partial > 0;
  const notReplaced = summary.superseded.length + summary.invalidFormat.length;
  /**
   * ⚠️ **브랜치는 사고가 없을 때만 헤드라인에 선다** (시안 `4e`) — `from main, but …`이면 절이 셋이 되어
   * 사고가 뒤로 밀린다. ⚠️ **들어간 표면이 하나도 없으면 `…, but …`을 쓰지 않는다** — `but`은 앞 절이
   * 성공일 때만 참이고, 그 갈래는 시안에 없다(전 표면 실패는 `4e` 다섯에 안 그려져 있다).
   * ⚠️ `could not be read`와 `was not replaced`를 한 문장으로 접지 않는다 — 뒤엣것은 읽혔고 적용만 안 됐다.
   */
  // 전 표면이 밀렸으면(`muted`) 실패가 아니다 — Logs와 같은 Superseded다(🔴 B). 원인 줄이 보조 문장을 든다.
  const title = !replaced ? (summary.tone === "muted" ? m.repositorySync.supersededTitle : m.repositorySync.failedTitle)
    : summary.unreadable.length ? m.repositorySync.withIssue(m.repositorySync.syncedKeys(summary.keys), m.repositorySync.unreadable(summary.unreadable.length))
    : notReplaced ? m.repositorySync.withIssue(m.repositorySync.syncedKeys(summary.keys), m.repositorySync.notReplaced(notReplaced))
    // ⚠️ **파일 일부 실패(`partial`)도 성공 헤드라인을 쓰지 않는다** — 표면은 전부 들어갔지만 값이
    // 버려졌으므로 `summary.tone`이 warning이다. 브랜치까지 붙이면 전부 성공한 결과와 **글자까지 같아진다**.
    : summary.partial > 0 || kept > 0 ? m.repositorySync.syncedKeys(summary.keys)
    : m.repositorySync.completed(summary.keys, branch);
  // `invalid-format`에는 재시도가 없다 — 포맷을 고치기 전에는 다시 눌러도 결과가 같다.
  const retry = summary.unreadable.length + summary.superseded.length > 0;
  const partialFailures = outcome.surfaces.filter(surface => surface.status === "partial").reduce((sum, surface) => sum + surface.failed, 0);
  // 관리하지 않는 항목은 사고가 아니다 — 톤·헤드라인을 안 바꾸고 안내 한 줄로만 선다 (B2 r3 · QA5).
  const unmanaged = outcome.surfaces.filter(surface => surface.status !== "failed").reduce((sum, surface) => sum + surface.unmanaged, 0);
  /*
    ⚠️ **말할 것이 없는 사고는 자리를 만들지 않는다** — 중복 키만으로도 `partial`이 된다
    (`buildPushPayload`의 `duplicateKeys`는 어댑터 오류가 아니라 `lastWins`가 조용히 흡수한다).
    그 표면은 사유도 파일 오류도 없어서, 거르지 않으면 **빈 `<div>`**가 남는다.
  */
  const incidents = [...outcome.surfaces]
    .filter(surface => surface.status !== "imported" && (surface.reason !== null || surface.errors.length > 0))
    .sort((a, b) => a.surfaceSlug < b.surfaceSlug ? -1 : a.surfaceSlug > b.surfaceSlug ? 1 : 0);
  /**
   * ⚠️ **사고가 없으면 `children`을 넘기지 않는다** — 빈 배열도 `Alert`의 본문 `<div>`를 세워
   * `space-y-2`가 제목 아래에 **보이지 않는 8px**을 만든다(같은 부류를 확인 Dialog의 본문에서 한 번
   * 밟았다). 성공이 한 줄이라는 것이 이 화면의 방어이므로 그 8px이 곧 형의 차이를 깎는다.
   */
  const details = incidents.length === 0 && partialFailures === 0 && kept === 0 && unmanaged === 0 ? undefined : <>
    {kept > 0 && <p>{m.repositorySync.kept(kept)}</p>}
    {summary.unreadable.length > 0 && notReplaced > 0 && <p>{m.repositorySync.notReplaced(notReplaced)}</p>}
    {partialFailures > 0 && <p>{m.repositorySync.partial(partialFailures)}</p>}
    {unmanaged > 0 && <p>{m.sources.unmanaged(unmanaged)}</p>}
    {incidents.map(surface =>
      <div key={surface.surfaceSlug} data-reason={surface.reason ?? undefined}>
        {/*
          ⚠️ **사유가 없으면 원인 줄을 만들지 않는다** — `partial`은 서버에서 `reason`이 **언제나
          `null`**이고(`lib/import/run.ts`의 `finishSurface`는 `prepared.kind === "failed"`에만 사유를
          단다), 폴백을 쓰면 `{slug} — The last import did not finish.`가 선다. **그 임포트는 끝났고
          키는 들어갔다** — 바로 위 헤드라인이 `Synced 18 keys`라 한 Alert 안에서 두 문장이 서로를
          부정한다 (2026-09-16 브라우저 실측). 이 갈래의 원인은 아래 파일 줄이 든다.
        */}
        {surface.reason !== null &&
          <p>{m.repositorySync.cause(<span data-surface="">{surface.surfaceSlug}</span>, reasonMessage(m, surface.reason))}</p>}
        {surface.errors.map((error, index) => <p key={index} data-error-code={error.code} className="whitespace-pre-wrap break-words">{error.path}: {adapterErrorMessage(error, m.adapterErrors)}</p>)}
      </div>)}
  </>;
  // 결과 톤은 Logs와 같은 어휘다(`EventTone`) — 무색(`muted`, 전 표면 superseded)은 Alert의 `neutral`이다.
  return <Alert variant={tone === "muted" ? "neutral" : tone} live={tone === "danger" ? "alert" : "status"} title={title}
    /* ⚠️ 잠금 사유(`waitPublish`)를 더는 들지 않는다 — Dialog 안이라 Publish가 같이 돌 수 없다(sync-lock S5 — 띠에서 옮겼다). */
    actions={retry && onRetry ? <Button onClick={onRetry}>{/* Sync의 글리프다(5-W2 — `RotateCcw`는 Clear filters 전용). 같은 Dialog를 여는 머리 [Sync]와 같은 모양이다. */}<ArrowDownToLine className="size-3.5" aria-hidden />{m.common.retry}</Button> : undefined}>
    {details}
  </Alert>;
}
