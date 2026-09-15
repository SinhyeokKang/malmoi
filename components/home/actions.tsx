"use client";

import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";

import { SyncButton } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import { PublishButton, PublishResult } from "@/components/publish-button";
import { ReconnectButton } from "@/components/reconnect-button";
import { ArchiveCard } from "@/components/settings/archive-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import type { HomeState } from "@/lib/home/state";
import { importFailureMessage } from "@/lib/projects/import-failure";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import type { PullOutcome } from "@/lib/pull/message";
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
  outcome: RepositoryImportOutcome | null;
  setOutcome: (outcome: RepositoryImportOutcome | null) => void;
  pull: PullOutcome | null;
  setPull: (outcome: PullOutcome | null) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
};

const Ctx = createContext<HomeActionsValue | null>(null);

function useHomeActions(): HomeActionsValue {
  const value = useContext(Ctx);
  // 도달 불가를 시끄럽게 둔다 — 조용히 아무것도 안 그리면 버튼이 사라진 화면을 아무도 못 본다.
  if (value === null) throw new Error("HomeActions: used outside its provider");
  return value;
}

export function HomeActions({ children }: { children: ReactNode }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
  const [pull, setPull] = useState<PullOutcome | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  return (
    <Ctx.Provider value={{ syncOpen, setSyncOpen, outcome, setOutcome, pull, setPull, titleRef }}>
      {children}
    </Ctx.Provider>
  );
}

/** 제목 — 권한이 바뀌어 트리거가 사라졌을 때 Dialog가 포커스를 되돌릴 자리다 (`SyncButton`의 계약). */
export function HomeTitle({ children }: { children: ReactNode }) {
  const { titleRef } = useHomeActions();
  return (
    <h1 ref={titleRef} tabIndex={-1} className="text-lg font-medium">
      {children}
    </h1>
  );
}

/**
 * 머리 오른쪽의 버튼 둘.
 *
 * ⚠️ **`[Sync]`는 EDITOR에게 부재이고 비활성이 아니다** (spec §8 · DESIGN §6.69) — 누를 수 없는
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
  /** 미연결·보관 — 둘 다 보낼 곳이 없다. */
  paused: boolean;
}) {
  const { syncOpen, setSyncOpen, setOutcome, setPull, titleRef } = useHomeActions();
  return (
    <div className="flex items-center gap-2">
      {!paused && (
        <SyncButton
          slug={slug}
          name={name}
          branch={branch}
          role={role}
          unsent={unsent}
          open={syncOpen}
          onOpenChange={setSyncOpen}
          onResult={setOutcome}
          fallbackFocusRef={titleRef}
        />
      )}
      {/* ⚠️ 보낼 것이 없으면 비활성이다 — 누르면 "보낼 것이 없다"만 말하는 버튼이 된다. */}
      <PublishButton slug={slug} count={unsent} disabled={paused || unsent === 0} onResult={setPull} />
    </div>
  );
}

/**
 * 본문 맨 위의 **고정 자리** — 상태 배너 하나 + 결과 Alert 둘.
 *
 * ⚠️ **배너와 결과가 같은 자리를 다투지 않는다.** 배너는 "지금 이 프로젝트가 어떤 상태인가"이고
 * 결과는 "방금 누른 것이 어떻게 됐나"라, 둘 다 서 있는 순간이 정상이다.
 */
export function HomeNotices({ slug, name, state, role, branch, failedSurface, reason, lastSyncAt, now }: {
  slug: string;
  name: string;
  state: HomeState;
  role: "OWNER" | "EDITOR";
  branch: string;
  failedSurface: string | null;
  reason: ImportFailureCode | null;
  lastSyncAt: Date | null;
  now: Date;
}) {
  const { outcome, setOutcome, pull, setPull, setSyncOpen } = useHomeActions();
  const owner = role === "OWNER";

  return (
    <div className="empty:hidden flex flex-col gap-3">
      {state === "import_failed" && failedSurface !== null && reason !== null && (
        <Alert
          variant="danger"
          title={m.home.banner.syncFailed.title}
          /* ⚠️ **원인 문장은 `importFailureMessage`가 든다** — 사전을 직접 인덱싱하면 그 폴백을 우회한다. */
          /* ⚠️ **`[Try again]`은 `[Sync]`와 같은 Action이다** — 확인 Dialog를 건너뛰지 않는다. */
          actions={owner ? <Button onClick={() => setSyncOpen(true)}>{m.home.banner.syncFailed.action}</Button> : undefined}
        >
          {m.home.banner.syncFailed.body(failedSurface, branch, importFailureMessage(reason))}{" "}
          {m.home.banner.syncFailed.safe(lastSyncAt === null ? null : relativeTime(lastSyncAt, now))}
          {!owner && <> {m.home.banner.syncFailed.editor}</>}
        </Alert>
      )}

      {state === "not_connected" && (
        <Alert
          variant="warning"
          title={m.home.banner.notConnected.title}
          actions={owner ? <ReconnectButton slug={slug} label={m.home.banner.notConnected.action} /> : undefined}
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
          actions={owner ? <ArchiveCard slug={slug} name={name} archived openPrUrl={null} /> : undefined}
        >
          {m.home.banner.archived.body}
          {!owner && <> {m.home.banner.archived.editor}</>}
        </Alert>
      )}

      <SyncResult
        slug={slug}
        branch={branch}
        outcome={outcome}
        onDismiss={() => setOutcome(null)}
        onRetry={() => setSyncOpen(true)}
      />
      {pull !== null && <PublishResult outcome={pull} />}
    </div>
  );
}

