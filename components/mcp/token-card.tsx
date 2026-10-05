"use client";
import { Fact } from "@/components/ui/facts";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { revokeApiToken, type ApiTokenRevokeResult } from "@/app/(edit)/mcp/actions";
import { GrantBadges } from "@/components/mcp/grant-badges";
import { McpIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import type { TokenGrant } from "@/lib/mcp/grant";
import { relativeTime } from "@/lib/relative-time";
import { formatDay } from "@/lib/date-format";

import type { ScopeProject } from "./token-grant-fields";
import { TokenModal } from "./token-modal";

/**
 * `/mcp`의 토큰 카드 (핸드오프 `1a`·`1b`·`1c`·`3a`·`4b`). **행동은 카드 머리에 있다** — 상태가 바뀌어도 자리가 같다(없음·만료 = Create,
 * 활성 = Rotate · Revoke). 활성에 primary가 없는 것이 의도다(핸드오프 결정 5).
 *
 * ⚠️ **"미확인"은 이 세션에만 산다**(핸드오프 §9) — 서버는 사용자가 값을 받았는지 모른다. 다음 성공 행동이 치우고, 새로고침하면 사라진다
 * (§13 열린 결정 2 — 닫기 버튼을 더하지 않는다). 응답을 잃으면 온라인일 때만 `router.refresh()`로 서버 상태를 다시 읽는다
 * (`home/sync-button.tsx`와 같은 처리). 자동 재시도는 없다.
 * ⚠️ **완료는 항상 DOM에 있는 `role="status"`가 말한다** — 카드가 바뀌는 것은 시각 신호뿐이다(live 영역은 삽입 시점에 등록된다).
 */

/** 서버가 판정한 카드 — 시각은 ISO 문자열로 넘어온다(RSC 경계). */
export type TokenCardData =
  | { state: "none" }
  | {
      state: "active" | "expired";
      grants: TokenGrant[];
      scope: { kind: "all" } | { kind: "projects"; projectIds: string[] };
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string;
    };

const TITLE_ID = "mcp-token-title";

export function TokenCard({ token, projects, now }: { token: TokenCardData; projects: readonly ScopeProject[]; now: string }) {
  const m = useMessages();
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "rotate"; key: number } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeFailed, setRevokeFailed] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<"issue" | "revoke" | null>(null);
  const [status, setStatus] = useState("");
  const [revoking, startRevoke] = useTransition();
  const createRef = useRef<HTMLButtonElement | null>(null);
  const rotateRef = useRef<HTMLButtonElement | null>(null);
  const revokeRef = useRef<HTMLButtonElement | null>(null);
  /**
   * 폐기 뒤 착지 대기 — ⚠️ **Create token은 서버 재검증이 카드를 `1a`로 바꾼 커밋에야 선다.** Dialog가 닫히는 순간엔 아직 없을 수
   * 있어(누른 Revoke도 사라진다) 그 사이 카드 제목에 두었다가, Create가 마운트되면 옮긴다(핸드오프 §8 — `3a` 확정 → Create token).
   */
  const landOnCreate = useRef(false);
  useEffect(() => {
    if (!landOnCreate.current || createRef.current === null) return;
    landOnCreate.current = false;
    createRef.current.focus();
  }, [token.state]);

  const heading = () => document.getElementById(TITLE_ID);
  const live = token.state === "active";
  const expired = token.state === "expired";

  /** 미확인 문장은 카드의 Alert(시각)와 항상 DOM에 있는 status 영역(낭독) 둘로 선다 — 조건부로 끼워 넣는 live 영역은 삽입 시점을 놓친다. */
  function unconfirm(kind: "issue" | "revoke") {
    setUnconfirmed(kind);
    setStatus(kind === "issue" ? m.mcpConnector.token.unconfirmed : m.mcpConnector.token.revokeUnconfirmed);
  }

  function refreshIfOnline() {
    if (navigator.onLine !== false) router.refresh();
  }

  function revoke() {
    if (revoking) return;
    setRevokeFailed(false);
    startRevoke(async () => {
      let result: ApiTokenRevokeResult | null | undefined;
      try {
        result = await revokeApiToken();
      } catch (thrown) {
        // 세션 만료의 redirect는 되던진다 — 삼키면 "확인하지 못했다"가 거짓으로 선다.
        unstable_rethrow(thrown);
        result = null;
      }
      if (result === null) {
        setRevokeOpen(false);
        unconfirm("revoke");
        refreshIfOnline();
        return;
      }
      if (result === undefined) return;
      if (!result.ok) {
        setRevokeFailed(true);
        return;
      }
      landOnCreate.current = true;
      setUnconfirmed(null);
      setStatus(m.mcpConnector.token.status.revoked);
      setRevokeOpen(false);
    });
  }

  const initial =
    token.state === "none"
      ? { grants: [], scope: "all" as const, projectIds: [] }
      : // 회전은 허용 동작·범위를 **현재 값으로** 채운다(범위는 이미 교집합). 만료는 기본 90 — 서버가 처음 고른 기간을 저장하지 않는다.
        { grants: token.grants, scope: token.scope.kind === "all" ? ("all" as const) : ("projects" as const), projectIds: token.scope.kind === "all" ? [] : token.scope.projectIds };

  return (
    <>
      <Card
        title={m.mcpConnector.token.title}
        titleId={TITLE_ID}
        action={
          <>
            {/* ⚠️ `h2` 바로 뒤다 — 이 화면의 배지는 이것 하나다(핸드오프 §4). */}
            {/* 만료는 호박이다 — GitHub 인가 만료와 같은 톤(2026-09-30 상태 통일). */}
            {expired && <StatusBadge state="expired" />}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {live ? (
                <>
                  {/* 회전 확정이 `danger`라 트리거도 `danger`다(🔴 L — push 토큰과 같은 동작·같은 형). */}
                  <Button ref={rotateRef} data-token-action="rotate" variant="danger" onClick={() => setModal({ mode: "rotate", key: Date.now() })}>
                    {m.mcpConnector.token.rotate}
                  </Button>
                  <Button ref={revokeRef} data-token-action="revoke" variant="danger" onClick={() => { setRevokeFailed(false); setRevokeOpen(true); }}>
                    {m.mcpConnector.token.revoke}
                  </Button>
                </>
              ) : (
                <Button ref={createRef} data-token-action="create" variant="primary" onClick={() => setModal({ mode: "create", key: Date.now() })}>
                  {m.mcpConnector.token.create}
                </Button>
              )}
            </div>
          </>
        }
        notice={unconfirmed !== null ? (
          <Alert variant="warning" inset>
            {unconfirmed === "issue" ? m.mcpConnector.token.unconfirmed : m.mcpConnector.token.revokeUnconfirmed}
          </Alert>
        ) : undefined}
      >

        {token.state === "none" ? (
          // 버튼이 없다 — 할 일이 머리의 Create token이다(대기 초대 0건과 같은 판정).
          <EmptyState placement="inset" icon={McpIcon} title={m.mcpConnector.token.emptyTitle} description={m.mcpConnector.token.emptyBody} />
        ) : (
          <TokenFacts token={token} now={new Date(now)} />
        )}
        <p role="status" data-token-live className="sr-only">
          {status}
        </p>
      </Card>

      {modal !== null && (
        <TokenModal
          key={modal.key}
          open
          mode={modal.mode}
          initial={initial}
          projects={projects}
          // 착지: Close → Rotate(뒤 페이지는 이미 활성), 취소 → 누른 버튼(없음이면 Create). 둘 다 없으면 카드 제목.
          returnFocusRef={rotateRef}
          fallbackFocusRef={createRef}
          onClose={() => setModal(null)}
          onIssued={() => {
            setUnconfirmed(null);
            setStatus(modal.mode === "rotate" ? m.mcpConnector.token.status.rotated : m.mcpConnector.token.status.created);
          }}
          onUnconfirmed={() => {
            setModal(null);
            unconfirm("issue");
            refreshIfOnline();
          }}
        />
      )}

      <Dialog open={revokeOpen} onOpenChange={(next) => { if (!next && !revoking) setRevokeOpen(false); }}>
        <DialogContent
          title={m.mcpConnector.revoke.title}
          description={m.mcpConnector.revoke.body}
          onCloseAutoFocus={(event) => {
            // ⚠️ 폐기 뒤엔 누른 Revoke가 사라져 기본 복귀가 닿을 곳이 없다 — Create token으로 간다(핸드오프 §8). 취소면 Revoke로 돌아간다.
            event.preventDefault();
            const target = landOnCreate.current ? (createRef.current ?? heading()) : (revokeRef.current ?? heading());
            if (target === createRef.current) landOnCreate.current = false;
            target?.focus();
          }}
          actions={
            <>
              <Button data-initial-focus disabled={revoking} onClick={() => setRevokeOpen(false)}>
                {m.common.cancel}
              </Button>
              <Button data-revoke-confirm variant="danger" loading={revoking} onClick={revoke}>
                {m.mcpConnector.revoke.confirm}
              </Button>
            </>
          }
        >
          {revokeFailed && <Alert variant="danger">{m.errors.access.unavailable}</Alert>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TokenFacts({ token, now }: { token: Exclude<TokenCardData, { state: "none" }>; now: Date }) {
  const style = useDateStyle();
  const m = useMessages();
  const expired = token.state === "expired";
  const created = new Date(token.createdAt);
  const expires = new Date(token.expiresAt);
  const lastUsed = token.lastUsedAt === null ? null : new Date(token.lastUsedAt);
  const scope = token.scope.kind === "all" ? m.mcpConnector.token.allProjects : m.mcpConnector.token.projects(token.scope.projectIds.length);
  // ⚠️ 만료된 값은 기록으로 남기되 흐리게 한다(핸드오프 결정 7) — 새 토큰을 만들 때 참고할 값이다.
  const facts: [string, ReactNode][] = [
    [m.mcpConnector.token.facts.grants, <GrantBadges key="g" grants={token.grants} dimmed={expired} />],
    [m.mcpConnector.token.facts.scope, scope],
    [m.mcpConnector.token.facts.created, <time key="c" dateTime={token.createdAt}>{formatDay(created, style)}</time>],
    [m.mcpConnector.token.facts.lastUsed, lastUsed === null ? m.mcpConnector.token.never : <time key="l" dateTime={token.lastUsedAt ?? ""}>{expired ? formatDay(lastUsed, style) : relativeTime(lastUsed, now, style.uiLocale)}</time>],
    [m.mcpConnector.token.facts.expires, <time key="e" dateTime={token.expiresAt}>{expired ? formatDay(expires, style) : relativeTime(expires, now, style.uiLocale)}</time>],
  ];
  return (
    // Alert 다음 행은 행↔행 선(`#e5e5e5`), 머리 바로 아래면 머리 선(`#f0f0f0`)이다(핸드오프 `4b`).
    <dl data-token-facts className="grid grid-cols-[120px_1fr] items-baseline gap-x-3 gap-y-2.5 px-4 py-3.5">
      {facts.map(([label, content]) => (
        <Fact key={label} width={120} label={label} dimmed={expired}>{content}</Fact>
      ))}
    </dl>
  );
}
