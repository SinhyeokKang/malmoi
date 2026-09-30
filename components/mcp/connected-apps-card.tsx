"use client";

import { CircleX } from "lucide-react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { disconnectOAuthConnection, type OAuthDisconnectResult } from "@/app/(edit)/mcp/actions";
import { BrandLogo } from "@/components/mcp/brand-logo";
import { GrantBadges } from "@/components/mcp/grant-badges";
import { CopyButton } from "@/components/onboarding/copy-button";
import { McpIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTile } from "@/components/ui/icon-tile";
import { type CountProps } from "@/components/ui/count-badge";
import { EmptyRowCard, RowCard, RowCardItem, RowCardList } from "@/components/ui/row-card";
import { m } from "@/lib/i18n";
import type { Brand } from "@/lib/mcp/brand";
import type { TokenGrant } from "@/lib/mcp/grant";
import { relativeTime } from "@/lib/relative-time";
import { utcDay } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

/**
 * `/mcp` **Connected apps** (mcp-oauth 핸드오프 §7.3 · §7.5 · `2a`–`2i` · spec 조건 8). 연결별 사실 + `Disconnect`. 개인 토큰 카드의 폐기 패턴을
 * 그대로 따른다 — 확인 Dialog · 제출 중 · 명시 실패는 Dialog 안에서 · 통신 단절은 **결과 미확인**(성공으로 말하지 않고 재조회).
 *
 * ⚠️ **조회 실패를 연결 없음으로 보이지 않는다**(`2i`) — 서버가 `apps: null`을 넘기면 카드 안 danger 행 + `Try again`이고 카운트 배지가 없다.
 * ⚠️ **이름은 신원 보증이 아니다** — 식별 줄을 함께 보이고, 같은 이름의 두 연결을 끊기 버튼의 접근 이름(`이름, 식별`)으로 구별한다.
 * ⚠️ 성공은 항상 DOM에 있는 `role="status"`가 말한다. 포커스는 다음 행의 Disconnect → (마지막이면) 이전 행 → (비면) 카드 제목이다.
 */

export type ConnectedAppData = {
  id: string;
  name: string;
  ident: string;
  state: "active" | "expired";
  grants: TokenGrant[];
  scope: { kind: "all" } | { kind: "projects"; projectIds: string[] };
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** 서버가 client_id 호스트로만 고른 로고(`lib/mcp/brand.ts`) — 이름으로 고르지 않는다. 없으면 MCP 기본 아이콘. */
  brand: Brand | null;
};

const TITLE_ID = "mcp-apps-title";

/** `serverUrl` — 이 요청의 origin으로 만든 MCP 주소(preview·로컬이면 그 주소). Connect 카드를 걷고 머리의 복사 버튼 하나로 남겼다(2026-09-30 사용자). */
export function ConnectedAppsCard({ apps, now, serverUrl }: { apps: readonly ConnectedAppData[] | null; now: string; serverUrl: string }) {
  const router = useRouter();
  // 대상은 닫힌 뒤에도 남긴다 — Dialog가 닫히는 동안 제목이 비지 않고, 닫힘 포커스 처리가 같은 콘텐츠에서 돈다.
  const [target, setTarget] = useState<ConnectedAppData | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  // 서버가 끊기를 확정한 행 — 재검증이 목록을 다시 그리기 전에도 사라져야 포커스가 옮겨 갈 자리가 맞는다.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  /** Dialog가 닫힌 뒤 착지할 곳 — 행 id(그 행의 Disconnect) 또는 카드 제목. 취소면 누른 행이다. */
  const landOn = useRef<string | "heading" | null>(null);

  const rows = apps === null ? null : apps.filter((app) => !removed.has(app.id));
  const heading = () => document.getElementById(TITLE_ID);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  /*
    명시 실패 뒤 Dialog가 남는다 — 진행 중 `disabled`가 포커스를 떨어뜨리므로 재시도 자리(확정 버튼)로 되돌린다(POSTMORTEM 2026-09-24).
    ⚠️ `useLandAfter`로는 안 된다 — Radix FocusScope가 떨어진 포커스를 Dialog 컨테이너로 잡아 "포커스를 잃었다"가 참이 아니다.
    성공·미확인은 Dialog가 닫혀 `onCloseAutoFocus`가 착지를 정한다.
  */
  useEffect(() => {
    if (failed && !pending && open) confirmRef.current?.focus();
  }, [failed, pending, open]);
  // id는 cuid라 선택자에 그대로 넣어도 되지만, 속성 대조로 찾으면 escape 판정 자체가 없다.
  const disconnectButton = (id: string) => [...document.querySelectorAll<HTMLButtonElement>("[data-app-disconnect]")].find((b) => b.dataset.appDisconnect === id) ?? null;

  function ask(app: ConnectedAppData) {
    setFailed(false);
    landOn.current = app.id;
    setTarget(app);
    setOpen(true);
  }

  function confirm() {
    if (pending || !open || target === null || rows === null) return;
    const app = target;
    setFailed(false);
    startTransition(async () => {
      let result: OAuthDisconnectResult | null | undefined;
      try {
        result = await disconnectOAuthConnection(app.id);
      } catch (thrown) {
        // 세션 만료의 redirect는 되던진다 — 삼키면 "확인하지 못했다"가 거짓으로 선다.
        unstable_rethrow(thrown);
        result = null;
      }
      if (result === undefined) return;
      if (result === null) {
        landOn.current = "heading";
        setUnconfirmed(app.name);
        setStatus(m.mcpConnector.apps.unconfirmed(app.name));
        setOpen(false);
        if (navigator.onLine !== false) router.refresh();
        return;
      }
      if (!result.ok) {
        setFailed(true);
        return;
      }
      const index = rows.findIndex((row) => row.id === app.id);
      const next = rows[index + 1] ?? rows[index - 1];
      landOn.current = next === undefined ? "heading" : next.id;
      setRemoved((set) => new Set(set).add(app.id));
      setUnconfirmed(null);
      setStatus(m.mcpConnector.apps.disconnected(app.name));
      setOpen(false);
    });
  }

  // 조회 전에는 개수가 없다 — 개수와 sr 문장은 짝이다(`CountProps`).
  const countProps: CountProps = rows === null ? {} : { count: rows.length, countLabel: m.mcpConnector.apps.count(rows.length) };
  return (
    <>
      <RowCard
        title={m.mcpConnector.apps.title}
        titleId={TITLE_ID}
        {...countProps}
        action={
          <div className="ml-auto shrink-0">
            <CopyButton value={serverUrl} label={m.mcpConnector.apps.copyServerUrl} />
          </div>
        }
      >
        {unconfirmed !== null && (
          <Alert variant="warning" inset live="status">
            {m.mcpConnector.apps.unconfirmed(unconfirmed)}
          </Alert>
        )}
        {rows === null ? (
          <div role="alert" data-apps-failed className="border-foreground/[0.06] text-destructive flex items-center gap-3 border-t px-4 py-[13px]">
            <CircleX className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">{m.mcpConnector.apps.loadFailed}</span>
            <Button className="text-foreground shrink-0" onClick={() => router.refresh()}>
              {m.common.retry}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyRowCard inset icon={McpIcon} title={m.mcpConnector.apps.emptyTitle} description={m.mcpConnector.apps.emptyBody} />
        ) : (
          // 선의 두 급(머리↔첫 행 · 행↔행)과 목록의 이름은 프리미티브가 든다 — 이웃 카드와 같은 규칙이 한 자리에 있게. 미확인 알림이 머리
          // 아래에 서면 첫 행은 알림 다음 행이라 행↔행 선이다.
          <RowCardList labelledBy={TITLE_ID}>
            {rows.map((app, index) => (
              <RowCardItem key={app.id} first={index === 0 && unconfirmed === null}>
                <AppRow app={app} now={new Date(now)} onDisconnect={() => ask(app)} />
              </RowCardItem>
            ))}
          </RowCardList>
        )}
        <p role="status" data-apps-live className="sr-only">
          {status}
        </p>
      </RowCard>

      <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) setOpen(false); }}>
        {target !== null && (
          <DialogContent
            title={m.mcpConnector.apps.confirmTitle(target.name)}
            description={m.mcpConnector.apps.confirmBody}
            // 초기 포커스는 Cancel — 되돌리기 쉬운 쪽이다(핸드오프 §8 · 토큰 폐기와 같다). 표식은 `DialogContent`가 읽는다.
            onCloseAutoFocus={(event) => {
              // 끊은 뒤엔 누른 버튼이 사라진다 — 다음 행 → 이전 행 → 카드 제목(핸드오프 §8). 취소면 누른 행으로 돌아간다.
              event.preventDefault();
              const land = landOn.current;
              landOn.current = null;
              (land === null || land === "heading" ? heading() : (disconnectButton(land) ?? heading()))?.focus();
            }}
            footer={
              <>
                <Button data-initial-focus disabled={pending} onClick={() => setOpen(false)}>
                  {m.common.cancel}
                </Button>
                <Button ref={confirmRef} data-disconnect-confirm variant="danger" loading={pending} onClick={confirm}>
                  {m.mcpConnector.apps.confirm}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              {/* 이름만으로는 같은 이름의 두 연결을 못 가른다 — 식별 줄까지 보인다(핸드오프 §7.5). */}
              <div data-disconnect-app className="border-border flex items-center gap-3 rounded-lg border p-3">
                {/* 행과 같은 로고 칸이다 — 무엇을 끊는지 목록에서 본 모양 그대로 알아본다. */}
                <IconTile size="lg">
                  {target.brand === null ? <McpIcon /> : <BrandLogo brand={target.brand} className="size-5" />}
                </IconTile>
                <div className="flex min-w-0 flex-col gap-px">
                  <span className="text-sm font-medium [overflow-wrap:anywhere]">{target.name}</span>
                  <span className="text-muted-foreground text-xs break-all">{target.ident}</span>
                </div>
              </div>
              {failed && <Alert variant="danger">{m.errors.access.unavailable}</Alert>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function AppRow({ app, now, onDisconnect }: { app: ConnectedAppData; now: Date; onDisconnect: () => void }) {
  const expired = app.state === "expired";
  const expires = new Date(app.expiresAt);
  const lastUsed = app.lastUsedAt === null ? null : new Date(app.lastUsedAt);
  const scope = app.scope.kind === "all" ? m.mcpConnector.token.allProjects : m.mcpConnector.token.projects(app.scope.projectIds.length);
  // 만료 행은 기록으로 남기되 흐리게 하고 시각은 절대 날짜다(토큰 카드의 만료와 같다).
  const facts: [string, ReactNode][] = [
    [m.mcpConnector.token.facts.grants, <GrantBadges key="g" grants={app.grants} dimmed={expired} />],
    [m.mcpConnector.token.facts.scope, scope],
    [m.mcpConnector.token.facts.lastUsed, lastUsed === null ? m.mcpConnector.token.never : <time dateTime={app.lastUsedAt ?? ""}>{expired ? utcDay(lastUsed) : relativeTime(lastUsed, now)}</time>],
    [m.mcpConnector.token.facts.expires, <time dateTime={app.expiresAt}>{expired ? utcDay(expires) : relativeTime(expires, now)}</time>],
  ];
  return (
    <div data-app-row={app.id} className="flex items-center gap-4 px-4 py-3.5">
      {/* 왼쪽 로고 칸은 40(`lg`)이다(2026-09-30 사용자). 만료 행도 로고는 그대로다 — 흐리게 하면 원본 색이 바뀐다. */}
      <IconTile size="lg" data-app-logo className="self-start">
        {app.brand === null ? <McpIcon /> : <BrandLogo brand={app.brand} className="size-5" />}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn("min-w-0 text-base font-medium [overflow-wrap:anywhere]", expired && "text-neutral-400")}>{app.name}</span>
          {expired && <Badge variant="warning" className="shrink-0">{m.mcpConnector.token.expired}</Badge>}
        </div>
        <span className="text-muted-foreground min-w-0 text-xs break-all">{app.ident}</span>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {facts.map(([label, content]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-xs text-neutral-400">{label}</dt>
              <dd className={cn("text-sm", expired && "text-neutral-400")}>{content}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Button data-app-disconnect={app.id} variant="danger" className="shrink-0" aria-label={m.mcpConnector.apps.disconnectLabel(app.name, app.ident)} onClick={onDisconnect}>
        {m.mcpConnector.apps.disconnect}
      </Button>
    </div>
  );
}
