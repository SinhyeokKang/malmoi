"use client";

import { ArrowDownToLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { checkOpenPullRequest, prepareRepositorySync, runRepositoryImport } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SyncResult, syncResultTitle } from "@/components/home/sync-result";
import { SlowLine, useSlow } from "@/components/slow-notice";
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
 * 그것이 곧 병합 로직이고 제품 원칙 위반이기 때문이다 (ARCHITECTURE §0 불변식 2).
 *
 * **확인 → 진행 → 결과가 이 Dialog 하나다** (sync-lock S5 · DESIGN §6.644). 확정해도 닫히지 않고, 결과가 같은 본문에 선다 — Sync가 도는
 * 동안 같은 프로젝트의 번역 쓰기가 서버에서 거부되므로 누른 사람이 "지금 돌고 있다"를 놓치지 않는 자리가 필요하다. 닫은 뒤의 기록은 Logs다.
 *
 * ⚠️ **열림 상태는 호스트가 소유하고 결과는 이 컴포넌트가 든다** — 이 컴포넌트는 머리의 고정 자리라 Action의 재검증이 다시 그려도
 * 언마운트되지 않는다(POSTMORTEM 2026-09-07의 `FirstIngestRetry`는 조건부 분기 안에 둔 결과였다). 호스트는 `onResult`로 교차 잠금만 잇는다.
 */
/** 응답 없이 이만큼 지나면 진행 Dialog가 닫기를 돌려준다 (sync-lock R3). 함수 상한 60초 + 왕복 여유. */
const EXIT_AFTER_MS = 70_000;

export function SyncButton({ slug, surfaceSlug, name, branch, role, unsent, paused = false, pausedReason = m.repositorySync.paused, onResult, onPendingChange, open, onOpenChange, fallbackFocusRef }: {
  /** 트리거가 사라졌을 때(권한 변경) 포커스를 받을 Home 제목. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  open: boolean; onOpenChange: (open: boolean) => void;
  slug: string; name: string; branch: string; role: "OWNER" | "EDITOR"; unsent: number;
  /**
   * 기본 표면 — `Publish first` 링크가 공가 redirect(`routes.translations`)를 건너뛰고 바로 간다 (audit-ux #4b).
   * 없으면(번역 화면 안의 [Sync]) 옛 경로다.
   */
  surfaceSlug?: string;
  /**
   * 미연결·보관 — **비활성이고 부재가 아니다** (DESIGN §6.64의 `2c`·`2d`). 부재는 역할
   * 갈래의 규칙이고(EDITOR에게 누를 수 없는 버튼을 주지 않는다), 이쪽은 **OWNER가 가진 동작이
   * 지금 멈춰 있다**는 뜻이라 그 사실을 화면에 남긴다.
   */
  paused?: boolean;
  /**
   * 멈춘 사유 — 호스트가 원인을 안다 (audit-ux #10). Publish 진행이면 `waitPublish`다: 옆 [Publish]의 라벨이 더는 진행을 말하지 않는다(D1).
   */
  pausedReason?: string;
  /** 결과가 왔다 — 호스트가 재검증 트리까지 교차 잠금을 잇는다(malmoi#103). Dialog가 70초 출구로 닫힌 뒤에 와도 부른다. */
  onResult: (outcome: RepositoryImportOutcome) => void;
  /**
   * ⚠️ **호스트가 `[Publish]`를 잠그려고 듣는다** (시안 `4f`) — 두 방향이 동시에 돌면 어느 쪽 값이
   * 남는지 화면이 설명할 수 없다. 이 컴포넌트는 **자기 연타만** 막으므로 형제의 존재는 호스트가 안다.
   */
  onPendingChange?: (pending: boolean) => void;
}) {
  const triggerId = useId();
  const describedId = useId();
  const warningId = useId();
  const pausedReasonId = useId();
  const [pending, setPending] = useState(false);
  /** Dialog 본문이 결과로 바뀌었다. 닫히면 비운다 — 기록은 Logs다. */
  const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
  /** 응답 없이 `EXIT_AFTER_MS`가 지났다 — 닫기만 돌려준다. 판정을 바꾸지 않는다(R3). */
  const [expired, setExpired] = useState(false);
  /** [Try again]이 확인 단계로 돌아갈 때마다 늘어 지문·PR 조회를 다시 부른다. */
  const [attempt, setAttempt] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  /** [Try again]으로 확인 단계에 돌아왔다 — 누른 버튼이 본문과 함께 사라져 포커스가 컨테이너로 빠지므로 Cancel로 옮긴다(POSTMORTEM 2026-09-20). */
  const returning = useRef(false);
  /*
    ⚠️ **연 자리를 렌더 시점에 잡는다** (U 리뷰 🟡) — Home 배너의 [Try again]으로 연 Sync가 성공하면 재검증 트리가 배너를 **닫기 전에** 걷고,
    `DialogContent`의 최근 포커스 기록이 더 오래된 요소(사이드바 링크 등)로 거슬러 갔다. 열린 직후 렌더에는 포커스가 아직 연 자리에 있다
    (Radix의 포커스 이동은 커밋 뒤다). ⚠️ Safari처럼 클릭이 포커스를 주지 않으면 `body`라 "모름"으로 친다 — 그때는 트리거로 간다.
  */
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(open);
  if (open && !wasOpen.current && typeof document !== "undefined") opener.current = document.activeElement;
  wasOpen.current = open;
  const slow = useSlow(pending);
  /** ⚠️ **`"checking"`을 `undefined`(실패)로 접지 않는다** (malmoi#75) — 조회 중과 조회 실패는 다른 줄이다. */
  const [openPr, setOpenPr] = useState<OpenImportPr | "checking">("checking");
  /**
   * 폐기 승인 — **지문과 그 지문이 가리키는 건수를 한 값으로 든다** (audit #2). Dialog가 열릴 때마다 새로 받는다
   * (sync-edit-protection — ARCHITECTURE §5.5.2의 폐기 승인). 서버가 잠금 뒤 재계산해 대조하므로 여기서 낡아도 편집이 사라지지 않고
   * reconfirm이 된다. 발급 실패면 `approval: null`로 보낸다.
   *
   * ⚠️ **화면의 `unsent`로 문구를 세우지 않는다** — 전엔 지문만 받아 두고 라벨·경고를 호출부의 건수로 그려서, 동료가 방금 만든 3건의
   * 지문을 "지울 것이 없다"는 창으로 승인시켰다. 서버는 그 지문을 정상 승인으로 받는다. 그래서 건수는 지문과 같은 응답에서만 온다.
   *
   * ⚠️ **`null`은 "아직 모른다"다** (audit #14) — 그 전에 누르면 `null`이 나가 서버가 reconfirm을 내고, 화면은
   * *"Translations changed after you opened Sync"* 라는 사실과 다른 문장을 띄웠다. **실패는 끝난 것이다** — 그때는 풀어서 `null`을
   * 보내고 서버가 재확인을 요구한다. 그동안의 건수는 호출부 값을 잠정으로 쓴다(확정이 막혀 있어 그 값으로 승인되는 일이 없다).
   */
  const [issued, setIssued] = useState<{ approval: string | null; unsent: number } | null>(null);
  const approvalPending = issued === null;
  const shownUnsent = issued === null || issued.approval === null ? unsent : issued.unsent;
  const router = useRouter();
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const id = ++request.current;
    setOpenPr("checking");
    setIssued(null);
    if (!open || role !== "OWNER" || paused) return;
    if (busy.current) { onOpenChange(false); return; }
    void prepareRepositorySync({ slug }).then(
      value => { if (request.current === id) setIssued(value === undefined ? { approval: null, unsent } : value); },
      () => { if (request.current === id) setIssued({ approval: null, unsent }); },
    );
    void checkOpenPullRequest({ slug }).then(
      value => { if (request.current === id) setOpenPr(value); },
      () => { if (request.current === id) setOpenPr(undefined); },
    );
    return () => { request.current++; };
  }, [open, slug, role, attempt]); // onOpenChange는 밖에서 다시 연 대기 Dialog를 닫기만 한다.
  /*
    ⚠️ **진행의 종료 조건은 Action 응답과 이 출구뿐이다 — lease가 아니다** (POSTMORTEM 2026-09-15: 서버 표면 표시가 남아 진행이 300초 지속).
    70초는 함수 상한(`maxDuration` 60)에 응답 왕복 여유를 더한 값이다 — 그 뒤엔 응답이 안 올 수 있어 사람을 Dialog에 가두지 않는다.
  */
  useEffect(() => {
    setExpired(false);
    if (!pending) return;
    const timer = setTimeout(() => setExpired(true), EXIT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  // 결과로 바뀌면 포커스가 [Close]로 간다 — 확정 버튼이 본문과 함께 사라지므로 두면 `body`로 빠진다(POSTMORTEM 2026-09-24).
  useEffect(() => {
    if (outcome !== null) closeRef.current?.focus();
    else if (returning.current) { returning.current = false; cancelRef.current?.focus(); }
  }, [outcome]);
  /*
    ⚠️ **`pending`을 호스트로 끌어올리지 않고 알리기만 한다** — 이 값은 `open && !pending`과 트리거
    라벨이 쓰는 지역 상태이고, 올리면 프롭이 controlled 쌍으로 늘어난다. 이 effect가 그 하나의
    근원에서 파생되므로 두 벌이 어긋날 자리가 없다.
  */
  useEffect(() => { onPendingChange?.(pending); }, [pending]); // onPendingChange의 참조 변경은 트리거가 아니다.
  // 조회 중은 계획에서 미확인과 같다 — 둘 다 "열린 PR이 없다"를 모르므로 블록이 선다.
  const plan = planImportConfirmation({ unsent: shownUnsent, openPr: openPr === "checking" ? undefined : openPr });
  const pr = plan.openPr;
  const closeDisabled = pending && !expired;
  function changeOpen(next: boolean) {
    if (next && busy.current) return;
    if (!next && closeDisabled) return;
    if (!next) setOutcome(null);
    onOpenChange(next);
  }
  /** 결과의 [Try again] — 같은 Dialog를 확인 단계로 되돌린다. 실행하지 않는다: 새 지문을 받고 사람이 다시 확정한다. */
  function retry() {
    returning.current = true;
    setOutcome(null);
    setAttempt(value => value + 1);
  }
  async function confirm() {
    if (busy.current || issued === null) return;
    const approval = issued.approval;
    busy.current = true;
    setPending(true);
    let outcome: RepositoryImportOutcome;
    try { outcome = await runRepositoryImport({ slug, approval }); }
    /*
      ⚠️ **온보딩 코드를 쓰지 않는다** — `ingest-failed`는 `PLANS`에도 `m.repositorySync.errors`에도
      없어 **두 폴백을 동시에 타서**, 닫을 수도 갈 곳도 없는 amber가 *"The first import failed. You can
      try again from settings."*를 띄운다. 첫 적재가 아닌데 그렇게 말하고, 그 설정 화면의 컨트롤은
      `awaiting_first_sync`에서만 서므로 **존재하지 않는 버튼**을 가리킨다. 캔버스 §6 `4f`의 tone 표가
      이 부류(요청이 못 갔다)에 배정한 것은 `unavailable`이다.
    */
    /*
      ⚠️ **`unavailable`로 접지 않는다** (malmoi#132) — throw는 요청이 나간 뒤 응답을 잃은 것일 수 있고, 그때 서버는 Sync를 끝냈다
      (편집 폐기 포함). "didn't go through"와 옛 `To send`가 되돌릴 수 없는 폐기를 안 일어난 일로 말했다. **다시 실행하지 않는다** —
      두 번 돌 수 있다. 서버 상태만 다시 읽는다(아래 refresh).
    */
    catch { outcome = { ok: false, error: "unconfirmed" }; }
    busy.current = false;
    setPending(false);
    onResult(outcome);
    // 70초 출구로 이미 닫혔으면 다시 열지 않는다 — 사람은 다른 일을 하고 있고, 기록은 Logs다.
    if (openRef.current) setOutcome(outcome);
    /*
      ⚠️ **응답을 잃은 실행만 refresh한다** — 아래 규칙의 유일한 예외다. Action의 재검증 트리가 응답과 함께 사라져 화면이 Sync 전
      트리로 남는다. 결과를 먼저 넘기는 것이 순서다: 호스트의 `wait()`가 옛 트리를 기준으로 떠야 refresh 트리까지 교차 잠금이 선다.
      ⚠️ **오프라인이면 부르지 않는다** — RSC fetch가 실패하면 Next가 브라우저 내비게이션으로 떨어져 오류 페이지가 결과를 덮는다.
      ⚠️ **온라인이어도 그 폴백은 남는다 — 알고 받는 대가다** (Next 16.3 `fetch-server-response`: `!res.ok || !isFlightResponse`면 같은
      MPA 폴백). 5xx면 브라우저 오류 페이지, 세션이 끝났으면 미들웨어 302로 `/signin`, 배포 스큐면 전체 리로드가 이 Alert를 덮는다.
      셋 다 리로드된 화면이 서버 상태를 말하므로 거짓 "안 됐다"보다 낫다 — `navigator.onLine`은 그중 명백한 하나만 거른다.
    */
    if (!outcome.ok && outcome.error === "unconfirmed" && navigator.onLine !== false) router.refresh();
    /*
      ⚠️ **응답이 온 결과에는 `router.refresh()`를 부르지 않는다** (audit-ux #12). Action이 `finally`에서 `revalidatePath(…, "layout")`를 부르고
      Next가 그 응답에 새 트리를 실어 커밋한다 — 여기서 또 부르면 결과가 선 뒤 두 번째 전체 렌더가 표시 없이 돌았다.
      실패 뒤의 refresh가 거부 Alert를 씻던 함정(POSTMORTEM 2026-09-08)은 응답이 온 거부에서는 호출이 없어 생기지 않는다 —
      `unconfirmed`의 refresh만 위의 MPA 폴백 갈래로 그 Alert를 덮을 수 있다.

      ⚠️ **이 실행을 async transition으로 감싸지 않는다** — React 19는 진행 중인 async transition을 전역으로 얽어
      (POSTMORTEM 2026-09-18), 긴 Sync 동안 그 뒤의 모든 transition(내비게이션 포함)이 끝날 때까지 커밋되지 않는다.
    */
  }
  if (role !== "OWNER") return null;
  /*
    ⚠️ **멈춘 동안은 Dialog 자체를 세우지 않는다** — 트리거만 `disabled`로 두면 `open`이 밖에서
    바뀔 때(배너의 `[Try again]`) 확인 창이 열려 실행까지 간다. 보이는 것은 같은 자리의 같은 버튼이고
    누를 수 없을 뿐이다.
    ⚠️ **진행·결과가 서 있는 동안은 예외다** — 결과의 재검증 트리가 연결 끊김을 싣고 오면(`paused`) Dialog째 결과가 사라진다.
  */
  /*
    ⚠️ **`disabled`가 아니라 `aria-disabled` + 사유다** (audit #37 — DESIGN §6.65). 진짜 `disabled`는 포커스를 못 받아
    왜 멈췄는지 닿을 길이 없었다. 미연결·보관은 가르지 않는다 — 같은 화면의 배너가 원인을 말한다. Publish 진행만 호스트가
    `pausedReason`으로 가른다 — [Publish] 라벨이 더는 진행을 말하지 않는다 (audit-ux #10 · D1). ⚠️ **보이는 사람에게는 `title`이다** — 머리에 문장을 세울 자리가 없고, 옆의 [Publish]가 같은 형이다
    (§6.646: `title`은 마우스용, sr-only는 describedby용).
  */
  if (paused && !pending && outcome === null) {
    return <>
      <Button aria-disabled aria-describedby={pausedReasonId} title={pausedReason} onClick={event => event.preventDefault()}>
        <ArrowDownToLine className="size-3.5" aria-hidden />
        {m.repositorySync.action}
      </Button>
      <span id={pausedReasonId} className="sr-only">{pausedReason}</span>
    </>;
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      {/*
        ⚠️ **진행 중에도 `disabled`가 아니라 `aria-disabled`다** — `disabled`면 Radix가 Dialog를 닫을 때
        포커스를 되돌릴 대상이 DOM에서 포커스를 못 받아 사라진다(DESIGN §6.64). 겉모습은 `default disabled`
        그대로이고 바뀌는 것은 포커스 가능성뿐이며, 클릭·Enter 연타는 핸들러가 막는다 (시안 §8).

        ⚠️ **그 겉모습을 여기서 그리지 않는다** (2026-09-17) — `buttonClass`의 `aria-disabled:` 짝이
        든다. 전엔 이 자리가 자기 철자를 들고 있었고, 같은 pending이 로그인·New project와 달라 보였다.

        ⚠️ **라벨은 도는 동안에도 `Sync`다** (audit-ux D1 — Button `loading` 규칙에 예외가 없다). 스피너가 아이콘을 **교체**하고
        (`[&_.animate-spin]:size-3.5`가 글리프 폭을 맞춘다), 라벨이 접근 이름이라 진행 신호는 `busy`의 `aria-busy`가 든다.
      */}
      <Button id={triggerId} className="[&_.animate-spin]:size-3.5" busy={pending} aria-disabled={pending} onClick={event => { if (busy.current) event.preventDefault(); }}>
        {!pending && <ArrowDownToLine className="size-3.5 text-neutral-600" aria-hidden />}
        {m.repositorySync.action}
      </Button>
    </DialogTrigger>
    <DialogContent
      closeDisabled={closeDisabled}
      /* 포커스는 [Cancel]이다 — 확인에 두면 Enter 한 번으로 되돌릴 수 없는 동작이 실행된다 (시안 §8). 표식은 `DialogContent`가 읽는다. */
      onCloseAutoFocus={event => {
        /*
          연 자리(배너의 [Try again] 등)가 아직 붙어 있으면 `DialogContent`의 기록이 그리로 돌려준다. 떨어졌거나 모르면 호출부가 고른다:
          트리거 → (트리거가 없거나 아직 도는 중 — 70초 출구로 닫음) 화면 제목. 꺼진 트리거에 서면 다음 Enter가 무반응이다.
        */
        const trigger = document.getElementById(triggerId);
        const from = opener.current;
        if (from instanceof HTMLElement && from !== document.body && from !== trigger && from.isConnected) return;
        const target = trigger !== null && trigger.getAttribute("aria-disabled") !== "true" ? trigger : fallbackFocusRef?.current ?? null;
        if (target === null) return;
        event.preventDefault();
        target.focus();
      }}
      /* 결과 단계는 결과별 제목이다(R6 — Publish 모달 §6.646과 같은 형). 확인 질문은 이미 답했다. */
      title={outcome !== null ? syncResultTitle(outcome) : m.repositorySync.title(name)}
      /*
        ⚠️ **경고 블록을 `aria-describedby`에 넣는다.** Radix는 그것을 `Description` 하나에만 걸어서,
        열릴 때 읽히는 것이 "리포를 읽어 덮는다"까지였다 — **무엇이 지워지는지는 안 읽혔다.** 포커스가
        [Cancel]에 있어 위로 훑어야만 만나는 자리인데, 이 Dialog가 유일한 방어선이라는 전제와 어긋난다.
        Radix가 자기 id를 먼저 걸고 `{...props}`를 나중에 펴므로 이 prop이 이긴다 — 그래서 설명문 id도
        우리가 들고 함께 넘긴다(빠뜨리면 설명문이 통째로 안 읽힌다).
      */
      /*
        ⚠️ **결과 단계엔 설명문이 없다** — "리포를 읽어 덮는다"는 이미 답한 질문이다. 명시적 `undefined`라야 Radix가 없는 id를 걸지 않는다.
      */
      aria-describedby={outcome !== null ? undefined : plan.atRisk ? `${describedId} ${warningId}` : describedId}
      description={outcome !== null ? undefined : <span id={describedId}>{m.repositorySync.body(<span className="text-neutral-600">{branch}</span>)}</span>}
      footer={outcome !== null
        /* 결과를 받고 닫는 자리라 [Close] 하나이고 `primary`다(DESIGN §6.4 Modal 행). */
        ? <DialogClose asChild><Button ref={closeRef} variant="primary">{m.common.close}</Button></DialogClose>
        : <>
          {/*
            ⚠️ **도는 동안 Cancel은 꺼진다** — 실행은 되돌릴 수 없고 Dialog가 진행을 든다. 70초 출구 뒤엔 같은 자리가 [Close]다(취소가 아니다 —
            서버는 계속 돈다). `aria-disabled`라 포커스는 남는다.
          */}
          {expired
            ? <DialogClose asChild><Button>{m.common.close}</Button></DialogClose>
            : <DialogClose asChild><Button ref={cancelRef} data-initial-focus aria-disabled={pending || undefined} onClick={event => { if (pending) event.preventDefault(); }}>{m.common.cancel}</Button></DialogClose>}
          {/* ⚠️ 무엇을 버리는지를 라벨이 먼저 말한다 — 미전달이 있으면 확정이 곧 폐기다 (sync-edit-protection spec "수동 Sync"). */}
          {/*
            ⚠️ `disabled`가 아니라 `aria-disabled`다 — 지문이 도착하면 같은 버튼이 풀리므로 포커스·Tab 순서가 그대로 남아야 한다.
            ⚠️ **진행도 이 버튼이 든다**(DESIGN §6.4 Dialog (b) 절차) — 라벨은 그대로, 스피너가 아이콘 자리에 서고 누른 포커스가 머문다.
          */}
          <Button variant="danger" className="[&_.animate-spin]:size-3.5" busy={approvalPending || pending} onClick={() => void confirm()}>
            {shownUnsent > 0 ? m.repositorySync.confirmDiscard : m.repositorySync.confirm}
          </Button>
        </>}>
      {/*
        결과는 `SyncResult` 형 그대로다(한 줄·두 줄 · danger면 `alert`). 닫기는 푸터의 [Close]가 들어서 Alert의 X를 넘기지 않는다.
        ⚠️ `unconfirmed`엔 [Try again]이 없다 — 서버가 끝냈을 수 있어 다시 돌리지 않는다(malmoi#132).
        ⚠️ **본문은 표현식 하나다** — 형제 표현식이 둘이면 `children`이 배열이 되어 `DialogContent`가 빈 본문 블록(죽은 공간 32)을 세운다.
      */}
      {outcome !== null ? <SyncResult outcome={outcome} slug={slug} branch={branch} onRetry={retry} /> : (plan.atRisk || slow || expired) && <>
      {/*
        ⚠️ **위험이 없으면 본문 자체가 없다** (시안 `4a`) — "없음"을 한 줄로 세우지 않는다: 부재가 곧
        정보다. `DialogContent`가 본문 없는 상태를 이미 그렇게 다룬다(빈 블록의 죽은 공간 32).
        ⚠️ **danger tone은 그대로다** — 갈리는 것은 손실의 양이지 동작의 성질이 아니고, `unsent`는 조회
        시점의 값이라 Dialog를 읽는 동안 낡는다.
      */}
      {plan.atRisk && <>
        {/*
          ⚠️ **`compact`다** — 360 Dialog에서 기본 `p-4`는 본문 폭을 296으로 떨어뜨려 두 줄 문장이 네 줄이 된다
          (시안 §7 · README §13-1). ⚠️ **알림은 Alert가 아니라 안쪽 줄 묶음이 든다** — 아래 주석.
          ⚠️ **글리프는 블록 머리에 하나다** — 줄마다 주면 경고가 둘인 화면이 되는데, 실제로는 한
          경고("덮인다")의 근거가 둘이다.
        */}
        <Alert id={warningId} variant="warning" size="compact">
          {/*
            PR 조회가 돌아오면 이 줄이 **바뀐다**(미확인 → PR 번호). 그 교체를 알리는 것이 live의 몫이다.
            ⚠️ **줄이 사라지는 것은 알리지 못한다** — `aria-relevant` 기본값이 `additions text`라 제거는
            announce되지 않는다. 다행히 사라지는 방향은 위험이 **줄어드는** 쪽이라 놓쳐도 덜 위험하고,
            반대로 두면(늘어나는 블록) 못 본 경고가 생긴다.
          */}
          <div aria-live="polite" className="space-y-1.5">
            {plan.recommendSend && <p>{m.repositorySync.unsent(shownUnsent, <span className="font-medium">{m.repositorySync.unsentCount(shownUnsent)}</span>)}</p>}
            {openPr === "checking"
              ? <p>{m.repositorySync.prChecking}</p>
              : pr === undefined
                ? <p>{m.repositorySync.prUnknown}</p>
                : pr !== null ? <p>{m.repositorySync.openPr(pr.number, branch)}</p> : null}
          </div>
        </Alert>
        {/*
          ⚠️ **권유는 링크이고 확인 버튼과 두 축으로 떨어진다** — 누르면 다른 라우트로 떠나므로 바닥
          오른쪽(= 이 질문에 답하는 자리)에 서면 세 번째 답으로 읽힌다.
          ⚠️ 미발송이 0이면 `Publish first`가 **거짓**이라 열린 PR 링크로 갈린다 (시안 `4c` 오른쪽).
          조회 중·실패(`undefined`)에는 권할 다음 행동이 없어 줄 자체가 없다 (`4d`).
        */}
        {plan.recommendSend
          ? <p className="text-muted-foreground">{m.repositorySync.sendHint(shownUnsent,
              <Link href={surfaceSlug === undefined ? routes.translations(slug) : routes.surfaceTranslations(slug, surfaceSlug)} className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none">{m.repositorySync.sendFirst}</Link>,
            )}</p>
          : pr !== undefined && pr !== null
            ? <p className="text-muted-foreground">{m.repositorySync.nothingUnsent}{" "}
                <a href={pr.url} target="_blank" rel="noreferrer" className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none">
                  {m.repositorySync.seeOpen}
                </a></p>
            : null}
      </>}
      {/* 지연 문구는 Dialog 안이다 — 띠가 걷혔다(DESIGN §6.644). 둘 다 판정이 아니다. */}
      {slow && <SlowLine />}
      {/* ⚠️ `status`다 — 포커스는 도는 확정 버튼에 머물러 있어, 알리지 않으면 스크린리더 사용자는 [Close]가 돌아온 것을 모른다. */}
      {expired && <p role="status" className="text-muted-foreground">{m.repositorySync.resultInLogs}</p>}
      </>}
    </DialogContent>
  </Dialog>;
}
