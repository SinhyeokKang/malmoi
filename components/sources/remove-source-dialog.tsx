"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { previewSourceRemoval, removeSource } from "@/app/(edit)/projects/[slug]/sources/actions";
import { useMessages } from "@/components/i18n/messages-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Messages } from "@/lib/i18n";
import { removalReason, type SourceRemovalError } from "@/lib/surfaces/plan-removal";

/**
 * 소스 제거 확인 창 (sources-add-remove — 시안 R4–R7). 상태 형은 `components/home/sync-button.tsx`다: 지문 대기 중 확정 `busy` ·
 * 진행 중 닫기 막힘 · 결과가 같은 창에 선다. 다른 점 셋은 시안의 닫힌 결정이다:
 * - **지문 발급 실패는 확정을 막는다** — Sync는 `approval: null`로 보내 서버가 재확인을 내지만, 제거에서 그 길은 누르면 반드시
 *   stale로 끝나는 막힌 클릭이다. [Try again]이 지문을 다시 받는다(R6).
 * - **확정 라벨은 트리거와 같은 낱말이다** — 손실은 Alert 첫 줄이 든다(R5).
 * - **SlowLine·70초 출구가 없다** — 제거는 `archivedAt` 쓰기 + 사건뿐이고 GitHub을 부르지 않는다(R7).
 *
 * ⚠️ **경고 줄은 지문과 같은 응답에서만 온다** (Sync audit #2와 같은 규칙) — 화면이 가진 건수로 문구를 세우면 동료가 방금 만든
 * 편집의 지문을 "버릴 것이 없다"는 창으로 승인시킨다. 서버는 잠금 뒤 다시 세어 대조한다.
 *
 * ⚠️ **성공하면 닫지 않는다** — 확정을 `busy`로 둔 채 호스트가 재검증 커밋 뒤 상세 모달째 닫는다(`useCommitWait`). 여기서 닫으면
 * 상세가 제거된 소스를 든 채 한 박자 남는다.
 */
type Preview =
  | { kind: "loading" }
  | { kind: "ready"; pendingCount: number; approval: string | null; openPr: "open" | "none" | "unknown" }
  | { kind: "failed" };
type Outcome = { tone: "danger" | "warning"; text: string };

export function RemoveSourceDialog({ open, onOpenChange, slug, surfaceSlug, onPending, onRemoved }: {
  open: boolean; onOpenChange: (open: boolean) => void; slug: string; surfaceSlug: string;
  /** 도는 동안 아래 상세 모달도 닫히지 않는다 — 호스트의 `busy`다. */
  onPending: (pending: boolean) => void;
  onRemoved: () => void;
}) {
  const m = useMessages();
  const router = useRouter();
  const describedId = useId();
  const warningId = useId();
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);
  /** [Try again]마다 늘어 지문을 다시 받는다. */
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const busy = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const id = ++request.current;
    setPreview({ kind: "loading" });
    setOutcome(null);
    if (!open) return;
    void previewSourceRemoval({ slug, surfaceSlug }).then(
      value => {
        if (request.current !== id) return;
        if (value.ok) setPreview({ kind: "ready", pendingCount: value.pendingCount, approval: value.approval, openPr: value.openPr });
        // 장애만 다시 받을 수 있다 — 판정 거부(마지막 소스·적재 중·권한)는 다시 받아도 같다.
        else if (value.error === "unavailable") setPreview({ kind: "failed" });
        else setOutcome({ tone: "danger", text: refusalText(m, value.error) });
      },
      () => { if (request.current === id) setPreview({ kind: "failed" }); },
    );
    return () => { request.current++; };
  }, [open, slug, surfaceSlug, attempt]); // m은 화면 언어가 바뀌어도 이미 받은 지문을 다시 받을 이유가 아니다.
  // 결과로 바뀌면 확정 버튼이 사라진다 — 포커스를 [Close]로 옮긴다(POSTMORTEM 2026-09-24).
  useEffect(() => { if (outcome !== null) closeRef.current?.focus(); }, [outcome]);
  useEffect(() => { onPending(pending); }, [pending]); // onPending의 참조 변경은 트리거가 아니다.

  async function confirm() {
    if (busy.current || preview.kind !== "ready") return;
    busy.current = true;
    setPending(true);
    try {
      const result = await removeSource({ slug, surfaceSlug, approval: preview.approval });
      if (result.ok) { onRemoved(); return; }
      setOutcome({ tone: "danger", text: refusalText(m, result.error) });
    } catch {
      /*
        ⚠️ **응답을 잃은 제거는 서버가 끝냈을 수 있다** (Sync malmoi#132와 같은 부류) — 다시 실행하지 않고 화면만 다시 읽는다.
        오프라인이면 부르지 않는다 — RSC fetch 실패가 MPA 폴백이 되어 오류 페이지가 결과를 덮는다(`sync-button.tsx`).
      */
      setOutcome({ tone: "warning", text: m.sources.removal.unconfirmed });
      if (navigator.onLine !== false) router.refresh();
    }
    busy.current = false;
    setPending(false);
  }

  const ready = preview.kind === "ready" ? preview : null;
  return <Dialog open={open} onOpenChange={next => { if (!next && pending) return; onOpenChange(next); }}>
    <DialogContent closeDisabled={pending} title={m.sources.removal.title(surfaceSlug)}
      // 경고 블록을 설명에 잇는다 — 포커스가 [Cancel]에 있어도 무엇이 사라지는지 읽힌다(Sync 확인 창과 같다). 결과 단계엔 설명이 없다.
      aria-describedby={outcome !== null ? undefined : ready ? `${describedId} ${warningId}` : describedId}
      description={outcome !== null ? undefined : <span id={describedId}>{m.sources.removal.body}</span>}
      actions={outcome !== null
        ? <DialogClose asChild><Button ref={closeRef} variant="primary">{m.common.close}</Button></DialogClose>
        : <>
          {/* 첫 포커스는 [Cancel]이다 — Enter 한 번으로 되돌릴 수 없는 동작이 실행되지 않는다. 도는 동안은 꺼지되 포커스는 남는다. */}
          <DialogClose asChild><Button data-initial-focus aria-disabled={pending || undefined} onClick={event => { if (pending) event.preventDefault(); }}>{m.common.cancel}</Button></DialogClose>
          <Button variant="danger" spinnerSize="sm" busy={preview.kind === "loading" || pending}
            aria-disabled={preview.kind === "failed" || undefined} onClick={() => { if (preview.kind === "ready") void confirm(); }}>
            {m.sources.removal.action}
          </Button>
        </>}>
      {/* ⚠️ 본문은 표현식 하나다 — 형제가 둘이면 `children`이 배열이 되어 `DialogContent`가 빈 본문 블록을 세운다(`sync-button.tsx`). */}
      {outcome !== null
        ? <Alert variant={outcome.tone} size="sm" live={outcome.tone === "danger" ? "alert" : "status"}>{outcome.text}</Alert>
        : preview.kind === "loading"
          // 워크플로 줄은 늘 오므로 Alert는 반드시 선다 — 골격은 그 한 줄짜리 Alert의 높이다(시안 R6 ①).
          ? <div data-removal-skeleton aria-hidden><Skeleton className="h-[66px] w-full rounded-md" /></div>
          : preview.kind === "failed"
            ? <Alert variant="danger" size="sm" actions={<Button size="sm" onClick={() => setAttempt(value => value + 1)}>{m.sources.retry}</Button>}>{m.sources.removal.previewFailed}</Alert>
            /* ⚠️ 글리프는 블록 머리에 하나다 — 한 경고("제거하면 이것들이 함께 간다")의 근거 셋이다. 손실이 큰 것부터 선다. */
            : <Alert id={warningId} variant="warning" size="sm">
              <div data-removal-warning aria-live="polite" className="space-y-1.5">
                {preview.pendingCount > 0 && <p>{m.sources.removal.unsent(preview.pendingCount, <span className="font-medium">{m.repositorySync.unsentCount(preview.pendingCount)}</span>)}</p>}
                {preview.openPr === "open" && <p>{m.sources.removal.openPr}</p>}
                {preview.openPr === "unknown" && <p>{m.sources.removal.prUnknown}</p>}
                <p>{m.sources.removal.workflowLine}</p>
              </div>
            </Alert>}
    </DialogContent>
  </Dialog>;
}

/** `invalid input`은 슬러그가 깨진 것이다 — 권한 문장으로 오역하지 않고 상세의 거부 문장을 쓴다. */
function refusalText(m: Messages, error: SourceRemovalError | "invalid input"): string {
  return error === "invalid input" ? m.sources.rejected : removalReason(m, error);
}
