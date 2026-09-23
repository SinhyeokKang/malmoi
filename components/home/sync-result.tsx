"use client";

import { RotateCcw } from "lucide-react";
import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { planImportRefusal } from "@/lib/import/refusal";
import { summarizeImport, type RepositoryImportOutcome, type RepositoryImportError, type SurfaceImportReason } from "@/lib/import/result";
import { onboardErrorMessage, isOnboardError } from "@/lib/onboarding/message";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { routes } from "@/lib/routes";

/**
 * ⚠️ **화면 전용 문구를 먼저 본다** — `not-ready`·`not-connected`는 온보딩·연결 사전에도 있지만
 * 그쪽 문장이 그 화면의 컨트롤을 가리킨다("use Authorize GitHub App below"). 여기엔 그 아래가 없다.
 */
function reasonMessage(reason: RepositoryImportError | SurfaceImportReason): string {
  if (Object.hasOwn(m.repositorySync.errors, reason)) return m.repositorySync.errors[reason as keyof typeof m.repositorySync.errors];
  if (isAccessError(reason)) return accessErrorMessage(reason);
  if (isOnboardError(reason)) return onboardErrorMessage(reason);
  if (isConnectError(reason)) return connectErrorMessage(reason);
  if (isImportFailureCode(reason)) return importFailureMessage(reason);
  return m.projects.importFailure.importFailed;
}

/**
 * PanelHeader 아래 고정 자리에 서는 **결과와 거부** (시안 `4e`·`4f`). 한 번에 하나만 선다.
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
 * ⚠️ **진행 표시를 여기 세우지 않는다** — 이 자리는 결과의 자리이고, 진행 Alert를 세웠다가 결과
 * Alert로 바꾸면 같은 자리에서 뜻이 두 번 바뀐다. 진행은 트리거가 든다 (`sync-button.tsx`).
 */
export function SyncResult({ outcome, slug, branch, onRetry, retryDisabled = false, onDismiss }: {
  outcome: RepositoryImportOutcome | null;
  slug: string;
  branch: string;
  /** 읽기 실패·`superseded`에만 선다. Home의 실패 배너와 **같은 라벨·같은 Action**이다. */
  onRetry?: () => void;
  /** ⚠️ 그 Action이 지금 잠겨 있나 (Publish 진행 중) — 같은 자리 셋이 같이 움직여야 한다. */
  retryDisabled?: boolean;
  onDismiss?: () => void;
}) {
  const retryReasonId = useId();
  if (outcome === null) return null;
  if (!outcome.ok) {
    const refusal = planImportRefusal(outcome.error);
    return <Alert variant={refusal.tone} role="status" title={reasonMessage(outcome.error)}
      onDismiss={refusal.dismissible ? onDismiss : undefined}
      actions={refusal.action === null ? undefined
        /*
          ⚠️ **로그인은 새 탭이다** (QA D2) — 같은 화면의 편집자 세션 Alert와 같은 형. 이 탭을 떠나면 번역 화면의 draft가
          함께 사라진다. `ButtonLink`는 `next/link`라 `target`을 안 받아 `<a>` + `buttonClass()`다(DESIGN §6.3).
        */
        : refusal.action === "sign-in"
          ? <a href={routes.signIn()} target="_blank" rel="noreferrer" className={buttonClass()}>{m.repositorySync.signIn}</a>
          : <ButtonLink href={routes.settings(slug)}>{refusal.action === "settings" ? m.repositorySync.openSettings : m.repositorySync.reconnect}</ButtonLink>} />;
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
  const title = !replaced ? m.repositorySync.failedTitle
    : summary.unreadable.length ? m.repositorySync.withIssue(m.repositorySync.syncedKeys(summary.keys), m.repositorySync.unreadable(summary.unreadable.length))
    : notReplaced ? m.repositorySync.withIssue(m.repositorySync.syncedKeys(summary.keys), m.repositorySync.notReplaced(notReplaced))
    // ⚠️ **파일 일부 실패(`partial`)도 성공 헤드라인을 쓰지 않는다** — 표면은 전부 들어갔지만 값이
    // 버려졌으므로 `summary.tone`이 warning이다. 브랜치까지 붙이면 전부 성공한 결과와 **글자까지 같아진다**.
    : summary.partial > 0 || kept > 0 ? m.repositorySync.syncedKeys(summary.keys)
    : m.repositorySync.completed(summary.keys, branch);
  // `invalid-format`에는 재시도가 없다 — 포맷을 고치기 전에는 다시 눌러도 결과가 같다.
  const retry = summary.unreadable.length + summary.superseded.length > 0;
  const partialFailures = outcome.surfaces.filter(surface => surface.status === "partial").reduce((sum, surface) => sum + surface.failed, 0);
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
  const details = incidents.length === 0 && partialFailures === 0 && kept === 0 ? undefined : <>
    {kept > 0 && <p>{m.repositorySync.kept(kept)}</p>}
    {summary.unreadable.length > 0 && notReplaced > 0 && <p>{m.repositorySync.notReplaced(notReplaced)}</p>}
    {partialFailures > 0 && <p>{m.repositorySync.partial(partialFailures)}</p>}
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
          <p>{m.repositorySync.cause(<span data-surface="">{surface.surfaceSlug}</span>, reasonMessage(surface.reason))}</p>}
        {surface.errors.map((error, index) => <p key={index} data-error-code={error.code} className="whitespace-pre-wrap break-words">{error.path}: {adapterErrorMessage(error)}</p>)}
      </div>)}
  </>;
  return <Alert variant={tone} role="status" title={title} onDismiss={onDismiss}
    /* ⚠️ `disabled`가 아니라 `aria-disabled` + 사유다 (audit #37) — 진짜 `disabled`는 포커스를 못 받아 왜 꺼졌는지 닿지 않았다.
       사유는 `<span>`이다 — 이 Alert의 형(줄 수)을 `<p>`로 센다. */
    actions={retry && onRetry ? <>
      <Button aria-disabled={retryDisabled || undefined} aria-describedby={retryDisabled ? retryReasonId : undefined} onClick={() => { if (!retryDisabled) onRetry(); }}><RotateCcw className="size-3.5" aria-hidden />{m.common.retry}</Button>
      {retryDisabled && <span id={retryReasonId} className="sr-only">{m.repositorySync.waitPublish}</span>}
    </> : undefined}>
    {details}
  </Alert>;
}
