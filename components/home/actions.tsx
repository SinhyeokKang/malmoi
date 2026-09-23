"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { SyncButton } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import { PublishButton, PublishModal, usePublish, type PublishController } from "@/components/publish-button";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { ReconnectButton } from "@/components/reconnect-button";
import { ArchiveCard } from "@/components/settings/archive-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { landFocus } from "@/components/ui/focus";
import { m } from "@/lib/i18n";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import type { HomeState } from "@/lib/home/state";
import { importFailureMessage } from "@/lib/projects/import-failure";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import { relativeTime } from "@/lib/relative-time";

/**
 * Home의 **두 자리에 걸친 상태 하나** (project-home T6 · sync-repository T9).
 *
 * ⚠️ **[Sync]는 머리에 있고 그 결과·배너는 본문에 있다.** 한 컴포넌트가 두 자리를 그릴 수 없고,
 * 결과를 아래쪽이 소유하면 머리의 `[Try again]`이 같은 Dialog를 못 연다 — 그래서 상태를 **컨텍스트가
 * 든다.** Provider는 DOM을 만들지 않으므로 `PanelHeader`·`PanelBody` 형제 구조가 그대로 남는다.
 *
 * ⚠️ **결과 자리가 무조건 렌더되는 곳이어야 한다** — 조건부 분기 안에 두면 `revalidatePath`·
 * `router.refresh()`가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07).
 */
type HomeActionsValue = {
  syncOpen: boolean;
  setSyncOpen: (open: boolean) => void;
  /**
   * ⚠️ **두 방향을 따로 센다** (시안 `4f`) — Sync는 리포로 DB를 덮고 Publish는 DB로 리포를 덮으므로,
   * 겹치면 남는 값이 두 요청의 도착 순서에 달린다. 화면이 약속할 수 없는 근거라 **한쪽이 도는 동안
   * 다른 쪽을 잠근다.** 각 버튼은 자기 연타만 막고 서로의 존재를 모르므로 이 판정은 호스트의 몫이다.
   *
   * ⚠️ **하나의 `busy`로 접지 않는다** — 그러면 Sync가 자기 자신을 잠가 `Syncing…` 트리거가 native
   * `disabled`로 떨어지고, Dialog가 포커스를 되돌릴 대상이 사라진다 (DESIGN §6.64).
   */
  syncPending: boolean;
  setSyncPending: (pending: boolean) => void;
  publishPending: boolean;
  publish: PublishController;
  outcome: RepositoryImportOutcome | null;
  setOutcome: (outcome: RepositoryImportOutcome | null) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
};

const Ctx = createContext<HomeActionsValue | null>(null);

function useHomeActions(): HomeActionsValue {
  const value = useContext(Ctx);
  // 도달 불가를 시끄럽게 둔다 — 조용히 아무것도 안 그리면 버튼이 사라진 화면을 아무도 못 본다.
  if (value === null) throw new Error("HomeActions: used outside its provider");
  return value;
}

export function HomeActions({ children, slug }: { children: ReactNode; slug: string }) {
  const [syncOpen, openSync] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const publish = usePublish(slug);
  const publishPending = publish.pending;
  /*
    ⚠️ **Publish가 도는 동안은 확인 창이 "예약"되지 않는다** (2026-09-15 재리뷰 🟡4 — 상호 잠금 자체가
    연 갈래다). `SyncButton`은 잠긴 동안 Dialog를 아예 세우지 않으므로, 그때 배너의 `[Try again]`이
    `syncOpen`을 참으로 만들면 **화면엔 아무 일도 없고 Publish가 끝나는 순간 되돌릴 수 없는 동작의
    확인 창이 혼자 열린다** — 사람이 이미 다른 것을 보고 있어도.

    ⚠️ **문을 하나로 좁힌다** — 여는 자리가 셋(머리의 트리거 · 실패 배너의 `[Try again]` · 결과
    Alert의 `[Try again]`)이라 호출부마다 조건을 달면 넷째 자리가 생길 때 빠진다. 반대 방향(창이
    열린 채 Publish가 시작)은 Dialog가 modal이라 그 버튼에 클릭이 닿지 않는다.
  */
  const setSyncOpen = (open: boolean) => openSync(open && !publishPending);
  const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  return (
    <Ctx.Provider value={{ syncOpen, setSyncOpen, syncPending, setSyncPending, publishPending, publish, outcome, setOutcome, titleRef }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * 제목 — 타일 28 + 이름 + (보관이면) pill.
 *
 * ⚠️ **포커스를 받는 자리다** — 권한이 바뀌어 `[Sync]` 트리거가 사라졌을 때 Dialog가 포커스를
 * 되돌릴 대상이 필요하다 (`SyncButton`의 계약).
 *
 * ⚠️ **이름이 18px이고 캔버스의 20이 아니다** (2026-09-15 사용자 판정). 리포의 패널 머리 `h1`이
 * 전부 `text-lg`이고, 한 화면만 다른 크기를 쓰면 화면을 옮길 때마다 제목이 뛴다 — 프리미티브가
 * 이기는 자리다. **의도된 이탈이고 `docs/DESIGN.md`에 있다.**
 *
 * ⚠️ **머리에 리포·브랜치·멤버 수를 적지 않는다** — 오른쪽 `Project` 카드가 그 사실의 소유자다.
 */
export function HomeTitle({ archived, children, image }: { archived: boolean; children: string; image?: string | null }) {
  const { titleRef } = useHomeActions();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProjectThumbnail name={children} src={image} />
      <h1 ref={titleRef} tabIndex={-1} className="truncate text-lg font-medium">
        {children}
      </h1>
      {/* 보관은 **머리에서** 말한다 — 배너는 스크롤되지만 이 pill은 제목과 함께 남는다. */}
      {archived && <Badge>{m.home.meta.archived}</Badge>}
    </span>
  );
}

/**
 * 머리 오른쪽의 버튼 둘.
 *
 * ⚠️ **`[Sync]`는 EDITOR에게 부재이고 비활성이 아니다** (DESIGN §6.64 · §6.69) — 누를 수 없는
 * 버튼을 주지 않는다. 판정은 `SyncButton`이 `role`로 직접 한다.
 *
 * ⚠️ **`[Publish]`는 EDITOR도 누른다** — PRODUCT §3이 허용하고 `translation:write`에 들어 있다.
 */
export function HomeHeaderActions({ slug, name, branch, role, unsent, paused }: {
  slug: string;
  name: string;
  branch: string;
  role: "OWNER" | "EDITOR";
  unsent: number;
  /**
   * 미연결·보관 — 둘 다 보낼 곳이 없다. **버튼 둘이 비활성이고 부재가 아니다** (DESIGN §6.64) —
   * 부재는 역할 갈래의 규칙이다.
   */
  paused: boolean;
}) {
  const { syncOpen, setSyncOpen, syncPending, setSyncPending, publishPending, publish, setOutcome, titleRef } = useHomeActions();
  return (
    <div className="flex items-center gap-2">
      <SyncButton
        slug={slug}
        name={name}
        branch={branch}
        role={role}
        unsent={unsent}
        /*
          ⚠️ **Publish가 도는 동안도 멈춘 상태다** — 뜻이 `paused`와 같다(OWNER가 가진 동작이 지금
          멈춰 있다). 같은 뜻에 프롭을 하나 더 만들지 않는다. **자기 자신의 진행은 넣지 않는다**:
          넣으면 `Syncing…` 트리거가 native `disabled`로 떨어져 포커스 복귀 대상이 사라진다.
        */
        paused={paused || publishPending}
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onPendingChange={setSyncPending}
        onResult={setOutcome}
        fallbackFocusRef={titleRef}
      />
      {/* ⚠️ 보낼 것이 없으면 비활성이다 — 누르면 "보낼 것이 없다"만 말하는 버튼이 된다. */}
      <PublishButton count={unsent} disabled={paused || syncPending} publish={publish} />
    </div>
  );
}

/**
 * 본문 맨 위의 **고정 자리** — 상태 배너 하나 + Sync 결과와 Publish 모달.
 *
 * ⚠️ **배너와 결과가 같은 자리를 다투지 않는다.** 배너는 "지금 이 프로젝트가 어떤 상태인가"이고
 * 결과는 "방금 누른 것이 어떻게 됐나"라, 둘 다 서 있는 순간이 정상이다.
 */
/*
  ⚠️ **`role="alert"`을 셋에 다 주지 않는다** — 캔버스는 셋 다 그렇게 적었지만 프리미티브의
  `danger`가 **이미** `role="alert"`이고(`alert.tsx`), 나머지 둘(미연결·보관)은 **화면에 처음부터
  있는 상태**이지 방금 일어난 사건이 아니다. assertive live 영역을 상시 상태에 쓰면 그 화면에
  들어올 때마다 스크린리더가 읽던 것을 끊는다. 의도된 이탈이고 `docs/DESIGN.md`에 있다.
*/
export function HomeNotices({ slug, name, state, role, branch, repo, unsent, failedSurface, reason, lastSyncAt, now }: {
  slug: string;
  name: string;
  state: HomeState;
  role: "OWNER" | "EDITOR";
  branch: string;
  /** ⚠️ **서버가 만든다** — `syncBranch`의 규칙이 사는 모듈은 클라이언트가 물면 안 된다(번들 7.2MB). */
  repo: { owner: string; name: string; branch: string; syncBranch: string };
  /** 미발송 수 — 모달의 조회 전 갈래(`1a` 스켈레톤·`1k`)가 그것을 말한다. */
  unsent: number;
  failedSurface: string | null;
  reason: ImportFailureCode | null;
  lastSyncAt: Date | null;
  now: Date;
}) {
  const { outcome, setOutcome, publish, titleRef, setSyncOpen, publishPending } = useHomeActions();
  const owner = role === "OWNER";
  /** 복원 거부 — 배너 `actions` 안이 아니라 **배너의 형제**로 선다 (audit #7 r1: 경고 속 경고가 됐다). */
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const retryReasonId = useId();
  /*
    ⚠️ **복원이 성공하면 이 배너가 통째로 사라진다** (audit #32 — B5 리뷰) — 누른 [Restore project]와 `ArchiveCard`의 착지가
    함께 언마운트되어 포커스가 `body`로 빠졌다. 남는 제목이 받는다(`SyncButton`의 폴백과 같은 자리).
  */
  const wasArchived = useRef(state === "archived");
  useEffect(() => {
    if (wasArchived.current && state !== "archived") landFocus(titleRef.current);
    wasArchived.current = state === "archived";
  }, [state, titleRef]);

  return (
    /*
      ⚠️ **여백을 이 블록이 든다** (2026-09-15 리뷰 🔴1) — 바깥 래퍼에 두면 `:empty`가 이 `<div>`를
      자식으로 보고 영원히 거짓이 되어, 배너가 0개인 **가장 흔한 화면**에 그 여백이 유령으로 남는다.
    */
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-4 empty:hidden">
      {state === "import_failed" && failedSurface !== null && reason !== null && (
        <Alert
          variant="danger"
          title={m.home.banner.syncFailed.title}
          /* ⚠️ **원인 문장은 `importFailureMessage`가 든다** — 사전을 직접 인덱싱하면 그 폴백을 우회한다. */
          /* ⚠️ **`[Try again]`은 `[Sync]`와 같은 Action이다** — 확인 Dialog를 건너뛰지 않는다. */
          /* ⚠️ **머리의 `[Sync]`와 같은 잠금을 받는다** — 같은 Action을 여는 세 자리가 다르게 움직이면
             "같은 라벨·같은 Action"이 화면에서 깨진다. 무반응인 버튼은 비활성보다 한 단계 아래다. */
          /* ⚠️ `disabled`가 아니라 `aria-disabled` + 사유다 (audit #37) — 결과 Alert의 [Try again]과 같은 형이다. */
          actions={owner ? <>
            <Button aria-disabled={publishPending || undefined} aria-describedby={publishPending ? retryReasonId : undefined} onClick={() => { if (!publishPending) setSyncOpen(true); }}>{m.home.banner.syncFailed.action}</Button>
            {publishPending && <span id={retryReasonId} className="sr-only">{m.repositorySync.waitPublish}</span>}
          </> : undefined}
        >
          {/*
            ⚠️ **본문이 muted다 — 제목과 글리프만 빨강이다** (캔버스 `2b`). 배너 전체가 빨가면
            "무엇이 안전한가"(나머지 표면은 들어왔다 · 값은 마지막 성공의 것이다)까지 경고로
            읽혀서, 이 배너가 하는 일의 절반이 사라진다.
          */}
          <span className="text-muted-foreground">
            {m.home.banner.syncFailed.body(failedSurface, branch, importFailureMessage(reason))}{" "}
            {m.home.banner.syncFailed.safe(lastSyncAt === null ? null : relativeTime(lastSyncAt, now))}
            {!owner && <> {m.home.banner.syncFailed.editor}</>}
          </span>
        </Alert>
      )}

      {state === "not_connected" && (
        <Alert
          variant="warning"
          title={m.home.banner.notConnected.title}
          /* ⚠️ **이 화면에서만 검정이 Publish가 아니다** (캔버스 `2c`) — 할 수 있는 일이 하나뿐이다. */
          actions={owner ? <ReconnectButton slug={slug} variant="primary" label={m.home.banner.notConnected.action} /> : undefined}
        >
          {m.home.banner.notConnected.body}
          {!owner && <> {m.home.banner.notConnected.editor}</>}
        </Alert>
      )}

      {state === "archived" && (
        <Alert
          variant="warning"
          title={m.home.banner.archived.title}
          /* 되돌리기는 확인을 묻지 않는다 — 잃는 것이 없다 (`ArchiveCard`의 규칙). */
          /*
            ⚠️ **`null`이 아니라 `undefined`다** — 그 prop의 계약이 `null`은 "없다", `undefined`는
            **"확인하지 못했다"**이고(POSTMORTEM 2026-09-03), Home은 열린 PR을 모른다. 지금은 복원
            분기가 그 값을 안 읽어 증상이 없지만, 같은 화면의 배너 문구가 정확히 그 거짓 단언을
            들고 있다가 2026-09-16에 걷혔다.
          */
          actions={owner ? <ArchiveCard slug={slug} name={name} archived openPrUrl={undefined} onFailure={setRestoreError} /> : undefined}
        >
          {m.home.banner.archived.body}
          {!owner && <> {m.home.banner.archived.editor}</>}
        </Alert>
      )}
      {state === "archived" && restoreError !== null && <Alert variant="danger">{restoreError}</Alert>}

      <SyncResult
        slug={slug}
        branch={branch}
        outcome={outcome}
        onDismiss={() => setOutcome(null)}
        retryDisabled={publishPending}
        /*
          ⚠️ **역할로 가른다 — 위 배너 셋과 같은 모양이다.** EDITOR에게 `[Try again]`이 서면
          `SyncButton`이 `role !== "OWNER"`에서 `null`이라 눌러도 확인 창이 안 열린다. 지금은 EDITOR가
          결과를 가질 경로가 없어 도달 불가지만, **무반응인 버튼은 비활성보다 한 단계 아래다**.
        */
        onRetry={owner ? () => setSyncOpen(true) : undefined}
      />
      <PublishModal slug={slug} publish={publish} fallbackFocusRef={titleRef} count={unsent} repo={repo} role={role} />
    </div>
  );
}

