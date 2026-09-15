"use client";

import { ArrowDownToLine, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { checkOpenPullRequest, runRepositoryImport } from "@/app/(edit)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { planImportConfirmation, type OpenImportPr } from "@/lib/import/confirm";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { routes } from "@/lib/routes";

/**
 * Home 머리의 `[Sync]`와 그 앞에 서는 확인 Dialog (시안 `4a`~`4d`·`4f`).
 *
 * **이 Dialog가 유일한 방어선이다** — 동작은 되돌릴 수 없고 동료의 편집을 지운다(`lib/push/apply.ts`가
 * `"updatedBy" = NULL`로 저자까지 비운다). 되돌리기·부분 선택·"내 편집만 지키기"를 그리지 않는 것은
 * 그것이 곧 병합 로직이고 제품 원칙 위반이기 때문이다 (spec §6.1).
 *
 * ⚠️ **원결과와 확인 창 상태는 Home의 안정된 호스트가 소유한다** — `router.refresh()`로 이 컴포넌트가
 * 다시 그려져도 결과가 살아 있어야 한다 (POSTMORTEM 2026-09-07의 `FirstIngestRetry`).
 */
export function SyncButton({ slug, name, branch, role, unsent, paused = false, onResult, onPendingChange, open, onOpenChange, fallbackFocusRef }: {
  /** 트리거가 사라졌을 때(권한 변경) 포커스를 받을 Home 제목. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  open: boolean; onOpenChange: (open: boolean) => void;
  slug: string; name: string; branch: string; role: "OWNER" | "EDITOR"; unsent: number;
  /**
   * 미연결·보관 — **비활성이고 부재가 아니다** (project-home spec §8의 `2c`·`2d`). 부재는 역할
   * 갈래의 규칙이고(EDITOR에게 누를 수 없는 버튼을 주지 않는다), 이쪽은 **OWNER가 가진 동작이
   * 지금 멈춰 있다**는 뜻이라 그 사실을 화면에 남긴다.
   */
  paused?: boolean;
  onResult: (outcome: RepositoryImportOutcome) => void;
  /**
   * ⚠️ **호스트가 `[Publish]`를 잠그려고 듣는다** (시안 `4f`) — 두 방향이 동시에 돌면 어느 쪽 값이
   * 남는지 화면이 설명할 수 없다. 이 컴포넌트는 **자기 연타만** 막으므로 형제의 존재는 호스트가 안다.
   */
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const triggerId = useId();
  const cancelId = useId();
  const describedId = useId();
  const warningId = useId();
  const [pending, setPending] = useState(false);
  const [openPr, setOpenPr] = useState<OpenImportPr>(undefined);
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const id = ++request.current;
    setOpenPr(undefined);
    if (!open || role !== "OWNER" || paused) return;
    if (busy.current) { onOpenChange(false); return; }
    void checkOpenPullRequest({ slug }).then(
      value => { if (request.current === id) setOpenPr(value); },
      () => { if (request.current === id) setOpenPr(undefined); },
    );
    return () => { request.current++; };
  }, [open, slug, role]); // onOpenChange only closes an externally reopened pending dialog.
  /*
    ⚠️ **`pending`을 호스트로 끌어올리지 않고 알리기만 한다** — 이 값은 `open && !pending`과 트리거
    라벨이 쓰는 지역 상태이고, 올리면 프롭이 controlled 쌍으로 늘어난다. 이 effect가 그 하나의
    근원에서 파생되므로 두 벌이 어긋날 자리가 없다.
  */
  useEffect(() => { onPendingChange?.(pending); }, [pending]); // onPendingChange identity is not a trigger.
  const plan = planImportConfirmation({ unsent, openPr });
  function changeOpen(next: boolean) {
    if (next && busy.current) return;
    onOpenChange(next);
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    changeOpen(false);
    let outcome: RepositoryImportOutcome;
    try { outcome = await runRepositoryImport({ slug }); }
    catch { outcome = { ok: false, error: "ingest-failed" }; }
    busy.current = false;
    setPending(false);
    onResult(outcome);
    /*
      ⚠️ **실패에는 부르지 않는다** (POSTMORTEM 2026-09-08 — 같은 부류가 Publish에서 한 번 터졌다).
      `unauthorized`로 거부된 직후의 refresh는 미들웨어의 렌더 차단에 걸려 **네비게이션**이 되고,
      한 줄 앞에서 세운 거부 Alert를 그대로 씻어 간다("왜 실패했는지가 어디에도 없다"). 갱신할 값은
      성공에만 있다 — 실패는 DB를 바꾸지 않았으므로 화면이 낡지도 않는다.
    */
    if (outcome.ok) router.refresh();
  }
  if (role !== "OWNER") return null;
  /*
    ⚠️ **멈춘 동안은 Dialog 자체를 세우지 않는다** — 트리거만 `disabled`로 두면 `open`이 밖에서
    바뀔 때(배너의 `[Try again]`) 확인 창이 열려 실행까지 간다. 보이는 것은 같은 자리의 같은 버튼이고
    누를 수 없을 뿐이다.
  */
  if (paused) {
    return (
      <Button disabled>
        <ArrowDownToLine className="size-3.5" aria-hidden />
        {m.repositorySync.action}
      </Button>
    );
  }
  return <Dialog open={open && !pending} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      {/*
        ⚠️ **진행 중에도 `disabled`가 아니라 `aria-disabled`다** — `disabled`면 Radix가 Dialog를 닫을 때
        포커스를 되돌릴 대상이 DOM에서 포커스를 못 받아 사라진다(spec §12-9). 겉모습은 `default disabled`
        그대로이고 바뀌는 것은 포커스 가능성뿐이며, 클릭·Enter 연타는 핸들러가 막는다 (시안 §8).
      */}
      <Button id={triggerId} aria-disabled={pending} onClick={event => { if (busy.current) event.preventDefault(); }}
        className="aria-disabled:text-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:hover:bg-background">
        {pending
          ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          : <ArrowDownToLine className="size-3.5 text-neutral-600" aria-hidden />}
        {pending ? m.repositorySync.pending : m.repositorySync.action}
      </Button>
    </DialogTrigger>
    <DialogContent
      /** 포커스는 [Cancel]이다 — 확인에 두면 Enter 한 번으로 되돌릴 수 없는 동작이 실행된다 (시안 §8). */
      onOpenAutoFocus={event => { event.preventDefault(); document.getElementById(cancelId)?.focus(); }}
      onCloseAutoFocus={event => {
        if (!document.getElementById(triggerId) && fallbackFocusRef?.current) {
          event.preventDefault();
          fallbackFocusRef.current.focus();
        }
      }}
      title={m.repositorySync.title(name)}
      /*
        ⚠️ **경고 블록을 `aria-describedby`에 넣는다.** Radix는 그것을 `Description` 하나에만 걸어서,
        열릴 때 읽히는 것이 "리포를 읽어 덮는다"까지였다 — **무엇이 지워지는지는 안 읽혔다.** 포커스가
        [Cancel]에 있어 위로 훑어야만 만나는 자리인데, 이 Dialog가 유일한 방어선이라는 전제와 어긋난다.
        Radix가 자기 id를 먼저 걸고 `{...props}`를 나중에 펴므로 이 prop이 이긴다 — 그래서 설명문 id도
        우리가 들고 함께 넘긴다(빠뜨리면 설명문이 통째로 안 읽힌다).
      */
      aria-describedby={plan.atRisk ? `${describedId} ${warningId}` : describedId}
      description={<span id={describedId}>{m.repositorySync.body(<span className="text-mono text-neutral-600">{branch}</span>)}</span>}
      footer={<>
        <DialogClose asChild><Button id={cancelId}>{m.common.cancel}</Button></DialogClose>
        <Button variant="danger" onClick={() => void confirm()}>{m.repositorySync.confirm}</Button>
      </>}>
      {/*
        ⚠️ **위험이 없으면 본문 자체가 없다** (시안 `4a`) — "없음"을 한 줄로 세우지 않는다: 부재가 곧
        정보다. `DialogContent`가 본문 없는 상태를 이미 그렇게 다룬다(빈 블록의 죽은 공간 32).
        ⚠️ **danger tone은 그대로다** — 갈리는 것은 손실의 양이지 동작의 성질이 아니고, `unsent`는 조회
        시점의 값이라 Dialog를 읽는 동안 낡는다.
      */}
      {plan.atRisk && <>
        {/*
          ⚠️ **`Alert warning`의 감축형이고 프리미티브로 올리지 않는다** — 소비자가 이 Dialog 하나이고,
          올리면 안 본 화면 넷이 함께 움직인다. 색 셋은 그대로이고 **치수만** 다르다(radius 10 ·
          padding 12 · 글자 13 · 글리프 14): 360 Dialog에서 `p-4` Alert는 본문 폭을 296으로 떨어뜨려
          두 줄 문장이 네 줄이 된다 (시안 §7 · README §13-1).
          ⚠️ **글리프는 블록 머리에 하나다** — 줄마다 주면 경고가 둘인 화면이 되는데, 실제로는 한
          경고("덮인다")의 근거가 둘이다.
        */}
        <div id={warningId} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {/*
            PR 조회가 돌아오면 이 줄이 **바뀐다**(미확인 → PR 번호). 그 교체를 알리는 것이 live의 몫이다.
            ⚠️ **줄이 사라지는 것은 알리지 못한다** — `aria-relevant` 기본값이 `additions text`라 제거는
            announce되지 않는다. 다행히 사라지는 방향은 위험이 **줄어드는** 쪽이라 놓쳐도 덜 위험하고,
            반대로 두면(늘어나는 블록) 못 본 경고가 생긴다.
          */}
          <div aria-live="polite" className="min-w-0 flex-1 space-y-1.5">
            {plan.recommendSend && <p>{m.repositorySync.unsent(unsent, <span className="font-medium">{m.repositorySync.unsentCount(unsent)}</span>)}</p>}
            {openPr === undefined
              ? <p>{m.repositorySync.prUnknown}</p>
              : openPr !== null ? <p>{m.repositorySync.openPr(openPr.number, branch)}</p> : null}
          </div>
        </div>
        {/*
          ⚠️ **권유는 링크이고 확인 버튼과 두 축으로 떨어진다** — 누르면 다른 라우트로 떠나므로 바닥
          오른쪽(= 이 질문에 답하는 자리)에 서면 세 번째 답으로 읽힌다.
          ⚠️ 미발송이 0이면 `Send changes first`가 **거짓**이라 열린 PR 링크로 갈린다 (시안 `4c` 오른쪽).
          조회 중·실패(`undefined`)에는 권할 다음 행동이 없어 줄 자체가 없다 (`4d`).
        */}
        {plan.recommendSend
          ? <p className="text-muted-foreground">{m.repositorySync.sendHint(
              <Link href={routes.translations(slug)} className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none">{m.repositorySync.sendFirst}</Link>,
            )}</p>
          : openPr !== undefined && openPr !== null
            ? <p className="text-muted-foreground">{m.repositorySync.nothingUnsent}{" "}
                <a href={openPr.url} target="_blank" rel="noreferrer" className="focus-visible:ring-ring inline-flex items-baseline gap-1 text-blue-600 focus-visible:ring-2 focus-visible:outline-none">
                  {m.repositorySync.seeOpen}
                  <ExternalLink className="size-3" aria-hidden />
                </a></p>
            : null}
      </>}
    </DialogContent>
  </Dialog>;
}
