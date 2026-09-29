"use client";

import { CircleX } from "lucide-react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { disconnectOAuthConnection, type OAuthDisconnectResult } from "@/app/(edit)/mcp/actions";
import { McpIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyRowCard, RowCard } from "@/components/ui/row-card";
import { m } from "@/lib/i18n";
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
};

const TITLE_ID = "mcp-apps-title";

export function ConnectedAppsCard({ apps, now }: { apps: readonly ConnectedAppData[] | null; now: string }) {
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
  const cancelRef = useRef<HTMLButtonElement | null>(null);
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

  return (
    <>
      <RowCard
        title={m.mcpConnector.apps.title}
        titleId={TITLE_ID}
        count={rows !== null && rows.length > 0 ? rows.length : undefined}
        countLabel={rows === null ? undefined : m.mcpConnector.apps.title}
      >
        {unconfirmed !== null && (
          <Alert variant="warning" inset role="status">
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
          <ul data-apps-list>
            {rows.map((app, index) => (
              <AppRow key={app.id} app={app} now={new Date(now)} line={index === 0 && unconfirmed === null ? "head" : "row"} onDisconnect={() => ask(app)} />
            ))}
          </ul>
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
            // 초기 포커스는 Cancel — 되돌리기 쉬운 쪽이다(핸드오프 §8 · 토큰 폐기와 같다).
            onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
            onCloseAutoFocus={(event) => {
              // 끊은 뒤엔 누른 버튼이 사라진다 — 다음 행 → 이전 행 → 카드 제목(핸드오프 §8). 취소면 누른 행으로 돌아간다.
              event.preventDefault();
              const land = landOn.current;
              landOn.current = null;
              (land === null || land === "heading" ? heading() : (disconnectButton(land) ?? heading()))?.focus();
            }}
            footer={
              <>
                <Button ref={cancelRef} disabled={pending} onClick={() => setOpen(false)}>
                  {m.common.cancel}
                </Button>
                <Button data-disconnect-confirm variant="danger" loading={pending} onClick={confirm}>
                  {m.mcpConnector.apps.confirm}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              {/* 이름만으로는 같은 이름의 두 연결을 못 가른다 — 식별 줄까지 보인다(핸드오프 §7.5). */}
              <div data-disconnect-app className="border-border flex flex-col gap-px rounded-lg border p-3">
                <span className="text-sm font-medium [overflow-wrap:anywhere]">{target.name}</span>
                <span className="text-muted-foreground text-xs break-all">{target.ident}</span>
              </div>
              {failed && <Alert variant="danger">{m.errors.access.unavailable}</Alert>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function AppRow({ app, now, line, onDisconnect }: { app: ConnectedAppData; now: Date; line: "head" | "row"; onDisconnect: () => void }) {
  const expired = app.state === "expired";
  const expires = new Date(app.expiresAt);
  const lastUsed = app.lastUsedAt === null ? null : new Date(app.lastUsedAt);
  const grants = app.grants.length === 0 ? m.mcpConnector.token.readOnly : app.grants.map((g) => m.mcpConnector.grants[g].label).join(" · ");
  const scope = app.scope.kind === "all" ? m.mcpConnector.token.allProjects : m.mcpConnector.token.projects(app.scope.projectIds.length);
  // 만료 행은 기록으로 남기되 흐리게 하고 시각은 절대 날짜다(토큰 카드의 만료와 같다).
  const facts: [string, ReactNode][] = [
    [m.mcpConnector.token.facts.grants, grants],
    [m.mcpConnector.token.facts.scope, scope],
    [m.mcpConnector.token.facts.lastUsed, lastUsed === null ? m.mcpConnector.token.never : <time dateTime={app.lastUsedAt ?? ""}>{expired ? utcDay(lastUsed) : relativeTime(lastUsed, now)}</time>],
    [m.mcpConnector.token.facts.expires, <time dateTime={app.expiresAt}>{expired ? utcDay(expires) : relativeTime(expires, now)}</time>],
  ];
  return (
    // 머리 바로 아래 첫 행은 머리 선(`#f0f0f0`), 그 밖은 행↔행 선(`#e5e5e5`)이다(핸드오프 §5).
    <li data-app-row={app.id} className={cn("flex items-center gap-4 border-t px-4 py-3.5", line === "head" ? "border-foreground/[0.06]" : "border-border")}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn("min-w-0 text-base font-medium [overflow-wrap:anywhere]", expired && "text-neutral-400")}>{app.name}</span>
          {expired && <Badge variant="neutral" className="shrink-0">{m.mcpConnector.token.expired}</Badge>}
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
      <Button data-app-disconnect={app.id} className="shrink-0" aria-label={m.mcpConnector.apps.disconnectLabel(app.name, app.ident)} onClick={onDisconnect}>
        {m.mcpConnector.apps.disconnect}
      </Button>
    </li>
  );
}
