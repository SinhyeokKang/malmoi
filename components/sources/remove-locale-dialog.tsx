"use client";
import { Fragment, useEffect, useId, useRef, useState } from "react";

import { previewSourceLocaleRemoval, removeSourceLocale } from "@/app/(edit)/projects/[slug]/sources/actions";
import { useMessages } from "@/components/i18n/messages-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Fact } from "@/components/ui/facts";
import { Link as InlineLink } from "@/components/ui/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { Messages } from "@/lib/i18n";
import { routes } from "@/lib/routes";

type Ready = { kind: "request-removal" | "cancel-add"; path: string | null; translations: number; pendingCount: number; delivered: boolean | null; approval: string };
type Preview = { kind: "loading" } | ({ kind: "ready" } & { data: Ready }) | { kind: "failed" } | { kind: "busy-sync" };
/** 결과 단계 — 이 Dialog 안에서 기다려도 풀리지 않는 거부다. 설명·확정을 걷고 Alert 한 장 + [Close]다(시안 D4 ①③④). */
type Outcome = { kind: "refused"; text: string } | { kind: "unsettled" };
export type RemoveOutcome =
  | { kind: "request-removal" | "cancel-add"; code: string; translations: number; delivered: boolean | null }
  | { kind: "lost"; code: string };

/**
 * **언어 제거 확인 — 제거 요청 · 추가 취소 공용** (locale-add E1 — 시안 D1–D5). 상태 형은 `remove-source-dialog.tsx`다: 지문 대기 중 확정 `busy` ·
 * 발급 실패는 확정을 막음([Try again]) · 진행 중 닫기 막힘 · 첫 포커스 [Cancel].
 *
 * ⚠️ **무엇이 일어나는지는 지문과 같은 응답에서만 온다** — 경로·번역 수·미전달 수·전달 여부를 화면이 가진 값으로 세우면 동료가 방금 만든
 * 편집의 지문을 "버릴 것이 없다"는 창으로 승인시킨다. 서버는 잠금 뒤 다시 대조하고, 어긋나면 `stale-approval`이다 — 그때 다시 받아 바뀐 수를
 * 새 값으로 그린다(옛 값과 나란히 두지 않는다, D3 ③).
 * ⚠️ **어느 효과인지(제거 요청/추가 취소)도 서버가 정한다** — 받는 동안의 설명만 행 상태로 짐작한다.
 * ⚠️ 제거는 미전달 편집을 마지막 전달 값으로 되돌리고(warning), 추가 취소는 값을 남기고 추적만 거둔다(neutral) — 톤이 갈리는 것이 의도다(D2).
 */
export function RemoveLocaleDialog({ open, onOpenChange, slug, source, code, adding, pullRequest, onDone, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; slug: string; source: string; code: string;
  /** 행이 Adding이다 — 받는 동안의 설명을 고르는 짐작일 뿐이다. */
  adding: boolean;
  /** 마지막 Publish의 호스트 표기 번호(`#128` · `!128`). 못 뽑았으면 `null`. */
  pullRequest: string | null;
  onDone: (outcome: RemoveOutcome) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const m = useMessages();
  const t = m.sources.locale;
  const describedId = useId();
  const warningId = useId();
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const busy = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const id = ++request.current;
    setPreview({ kind: "loading" });
    if (!open) { setOutcome(null); setStale(false); return; }
    void previewSourceLocaleRemoval({ slug, surfaceSlug: source, localeCode: code }).then(
      value => {
        if (request.current !== id) return;
        if (value.ok) setPreview({ kind: "ready", data: value });
        else if (value.error === "unavailable") setPreview({ kind: "failed" });
        // Sync가 끝나면 풀린다 — 실패와 같은 자리에서 다시 받는다(D4 ②).
        else if (value.error === "sync-running") setPreview({ kind: "busy-sync" });
        else setOutcome(refusal(m, value.error, code));
      },
      () => { if (request.current === id) setPreview({ kind: "failed" }); },
    );
    return () => { request.current++; };
  }, [open, slug, source, code, attempt]); // m은 화면 언어가 바뀌어도 이미 받은 지문을 다시 받을 이유가 아니다.
  // 결과로 바뀌면 확정 버튼이 사라진다 — 포커스를 [Close]로 옮긴다(POSTMORTEM 2026-09-24).
  useEffect(() => { if (outcome !== null) closeRef.current?.focus(); }, [outcome]);

  async function confirm() {
    if (busy.current || preview.kind !== "ready") return;
    const data = preview.data;
    busy.current = true;
    setPending(true);
    try {
      const result = await removeSourceLocale({ slug, surfaceSlug: source, localeCode: code, approval: data.approval });
      if (result.ok) { onDone({ kind: result.kind, code, translations: data.translations, delivered: data.delivered }); return; }
      if (result.error === "stale-approval" || result.error === "approval-required") {
        // 다시 읽고 다시 묻는다 — 포커스는 [Cancel]이다(D3 ③).
        setStale(true);
        cancelRef.current?.focus();
        setAttempt(value => value + 1);
      } else if (result.error === "sync-running") setPreview({ kind: "busy-sync" });
      else setOutcome(refusal(m, result.error, code));
    } catch {
      // 응답을 잃은 제거는 서버가 끝냈을 수 있다 — 다시 실행하지 않는다. 결과는 호스트가 다시 읽어 말한다.
      busy.current = false;
      onDone({ kind: "lost", code });
      return;
    }
    busy.current = false;
    setPending(false);
  }

  const ready = preview.kind === "ready" ? preview.data : null;
  const cancelAdd = ready !== null ? ready.kind === "cancel-add" : adding;
  const description = cancelAdd ? ((ready?.delivered ?? false) ? t.cancelAddDeliveredBody : t.cancelAddBody) : t.removeBody;
  const warns = ready !== null && (ready.kind === "request-removal" || ready.pendingCount > 0);
  return <Dialog open={open} onOpenChange={next => { if (!next && pending) return; onOpenChange(next); }}>
    <DialogContent closeDisabled={pending} onCloseAutoFocus={onCloseAutoFocus} className="[&_h2]:wrap-anywhere" title={t.removeTitle(code, source)}
      aria-describedby={outcome !== null ? undefined : warns ? `${describedId} ${warningId}` : describedId}
      description={outcome !== null ? undefined : <span id={describedId}>{description}</span>}
      actions={outcome !== null
        ? <DialogClose asChild><Button ref={closeRef} variant="primary">{m.common.close}</Button></DialogClose>
        : <>
          <DialogClose asChild><Button ref={cancelRef} data-initial-focus aria-disabled={pending || undefined} onClick={event => { if (pending) event.preventDefault(); }}>{m.common.cancel}</Button></DialogClose>
          <Button variant="danger" spinnerSize="sm" busy={preview.kind === "loading" || pending}
            aria-disabled={preview.kind === "failed" || preview.kind === "busy-sync" || undefined} onClick={() => { if (preview.kind === "ready") void confirm(); }}>
            {t.removeLanguage}
          </Button>
        </>}>
      {outcome !== null
        ? outcome.kind === "unsettled"
          // 결과 미확정 Publish — 버린 값이 있을지 모르는 상태라 warning이고, 확인 방법(Logs)을 앱 안 링크로 든다. 완료 문구는 없다(D4 ④).
          ? <div className="space-y-2">
            <Alert variant="warning" size="sm" live="alert" title={t.unsettledTitle}>{t.notConfirmedHelp}</Alert>
            <p className="text-muted-foreground">{t.checkLogs(<InlineLink href={routes.logs(slug)}>{m.common.nav.logs}</InlineLink>)}</p>
          </div>
          : <Alert variant="danger" size="sm">{outcome.text}</Alert>
        /* live region은 지문 대기 중부터 선다 — 내용을 든 채 새로 마운트된 live region은 읽히지 않는다(remove-source-dialog 리뷰 B2 🟡1). */
        : <div aria-live="polite" className="space-y-2">
          {stale && <Alert variant="info" size="sm" live="off">{t.changed}</Alert>}
          {preview.kind === "loading"
            /* 골격은 대체될 사실 판 + 경고와 같은 마크업을 `invisible`로 깔아 높이를 얻는다 — 치수를 박지 않는다(#192). */
            ? <div data-removal-skeleton aria-hidden className="relative space-y-2">
              <div className="invisible space-y-2"><Facts m={m} code={code} path={code} translations={0} pullRequest={t.notSentYet} />
                {!adding && <Alert variant="warning" size="sm" live="off">{t.appCodeLine}</Alert>}</div>
              <Skeleton className="absolute inset-0 rounded-lg" />
            </div>
            : preview.kind === "failed" || preview.kind === "busy-sync"
              ? <Alert variant="danger" size="sm" live="off" actions={<Button size="sm" onClick={() => {
                // 누른 버튼이 골격과 함께 사라진다 — 창의 첫 포커스와 같은 [Cancel]로 옮긴다(#193).
                cancelRef.current?.focus();
                setAttempt(value => value + 1);
              }}>{m.sources.retry}</Button>}>{preview.kind === "failed" ? t.previewFailed(code) : t.syncRunning(code)}</Alert>
              : ready !== null && <>
                <Facts m={m} code={code} translations={ready.translations}
                  path={ready.path !== null && ready.kind === "cancel-add" && ready.delivered === false ? t.notCreatedYet(ready.path) : ready.path}
                  pullRequest={ready.delivered === null ? t.couldntConfirm : !ready.delivered ? t.notSentYet
                    : pullRequest === null ? t.inOpenPr : ready.kind === "cancel-add" ? t.prAdds(pullRequest) : t.prRemoves(pullRequest)} />
                {/* 손실이 큰 것부터 — 버려지는 미전달 편집, 그다음 사람이 리포에서 할 일. 앱 코드 경고는 아직 리포에 없는 언어(추가 취소)엔 없다. */}
                {ready.kind === "request-removal"
                  ? <Alert id={warningId} variant="warning" size="sm" live="off">
                    <div className="space-y-1.5">
                      {ready.pendingCount > 0 && <p>{t.discardLine(<span className="font-medium">{m.repositorySync.unsentCount(ready.pendingCount)}</span>)}</p>}
                      <p>{t.appCodeLine}</p>
                    </div>
                  </Alert>
                  : ready.pendingCount > 0 && <Alert id={warningId} variant="neutral" size="sm" live="off">{t.untrackLine(ready.pendingCount, <span className="font-medium">{m.repositorySync.unsentCount(ready.pendingCount)}</span>)}</Alert>}
              </>}
        </div>}
    </DialogContent>
  </Dialog>;
}

/** 대상은 사실 판 하나다 — 문장 속에 섞으면 경로가 줄 가운데서 꺾여 읽기 어렵다(D1). 라벨 열 96은 Facts 형이다. */
function Facts({ m, code, path, translations, pullRequest }: { m: Messages; code: string; path: string | null; translations: number; pullRequest: string }) {
  const t = m.sources.locale;
  return <dl data-removal-facts className="border-border bg-muted/40 space-y-2 rounded-lg border p-3">
    <Fact width={96} label={t.factLanguage}>{code}</Fact>
    {path !== null && <Fact width={96} label={t.factFile}><span className="wrap-anywhere">{path.split("/").map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>)}</span></Fact>}
    <Fact width={96} label={t.factTranslations}>{t.keptInMalmoi(translations)}</Fact>
    <Fact width={96} label={t.factPullRequest}>{pullRequest}</Fact>
  </dl>;
}

/** 결정적 거부 — 설명·확정을 걷고 문장 한 장이다. `baseline-*`은 Revert를 안내하지 않는다(같은 이유로 막힌다). */
function refusal(m: Messages, error: string, code: string): Outcome {
  const t = m.sources.locale;
  if (error === "publish-unsettled") return { kind: "unsettled" };
  if (error === "baseline-unknown" || error === "baseline-stale") return { kind: "refused", text: t.baselineUnknown(code) };
  if (error === "base-locale") return { kind: "refused", text: t.baseReason };
  if (error === "archived") return { kind: "refused", text: t.archived };
  return { kind: "refused", text: t.removeFailed(code) };
}
