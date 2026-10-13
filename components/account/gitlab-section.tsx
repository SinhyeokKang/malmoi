"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { disconnectGitLab } from "@/app/(edit)/account/actions";
import { GitLabTokenForm } from "@/components/gitlab/token-form";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { BrandGlyph } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardRows } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { landFocus } from "@/components/ui/focus";
import { IconTile } from "@/components/ui/icon-tile";
import { ListRow } from "@/components/ui/list-row";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly } from "@/lib/date-format";
import { STATE, type StateKey } from "@/lib/status/canon";
import { tokenExpiryState } from "@/lib/status/token-expiry";

/** 서버가 넘기는 값 — 만료일은 ISO 문자열이다(직렬화 경계). `projectCount`는 이 연결을 참조하는 프로젝트 수다. */
export type GitLabConnectionSummary = { username: string; expiresAt: string | null; projectCount: number };

/**
 * GitLab PAT 카드 (시안 G8 · design-brief 확정 6·7) — **토큰의 자리**다. 상태 배지는 "토큰이 어떤가"를 말한다(design §2 톤 표): 정상
 * `Connected` · 14일 이내 `Expires soon` · 지남 `Expired`. 프로젝트의 Connection 행과 다른 자리다(GitHub App 카드의 `Expired`와 같은 분리).
 *
 * ⚠️ **미연결이면 카드 안에 PAT 입력**이 선다(확정 7 — 계정 연결이 정본이다). ⚠️ **[Replace token]은 같은 GitLab 계정의 토큰만 받는다**(D19 —
 * 다른 계정이면 `account-mismatch`). ⚠️ [Disconnect]의 접근 이름이 축을 든다 — 같은 화면에 GitHub App 카드가 나란히 선다(DESIGN §6.646).
 * ⚠️ 해제 실패는 구역 Alert다 — 우측 컨트롤 옆에 세우면 행이 무너진다(`GithubSection`과 같다).
 */
export function GitLabSection({ connection }: { connection: GitLabConnectionSummary | null }) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [pending, startTransition] = useTransition();
  const connected = connection !== null;

  /*
    전이마다 포커스를 남는 컨트롤로 옮긴다(`GithubSection`과 같은 처리, audit #32) — 해제 뒤엔 누른 버튼이 사라져 PAT 입력으로, 연결 뒤엔 입력하던 폼이
    사라져 연결 행의 [Replace token]으로 간다(시안 G8b → G8 · #257). 둘 다 안 하면 포커스가 `body`로 빠진다.
  */
  const body = useRef<HTMLDivElement>(null);
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (wasConnected.current && !connected) landFocus(body.current?.querySelector<HTMLElement>("input, button"));
    if (!wasConnected.current && connected) landFocus(body.current?.querySelector<HTMLElement>("[data-gitlab-replace]"));
    wasConnected.current = connected;
  }, [connected]);

  const expiresAt = connection?.expiresAt == null ? null : new Date(connection.expiresAt);
  const now = new Date();
  const expiry = tokenExpiryState(expiresAt, now);
  // 임박·만료는 칩이 호박이고 [Replace token]이 할 일이 된다(primary — 시안 G8). 임박은 머리 띠가 남은 일수를 말한다(#255).
  const attention = connected && expiry !== "valid";
  const soonNotice = connected && expiry === "expiresSoon" && expiresAt !== null
    ? m.account.gitlab.expiresSoonNotice(Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)), formatDateOnly(expiresAt, uiLocale))
    : null;
  const state: StateKey = !connected ? "notConnected" : expiry === "expired" ? "expired" : expiry === "expiresSoon" ? "expiresSoon" : "connected";
  const description = !connected
    ? m.account.gitlab.hintNotConnected
    : [
        expiresAt === null ? m.account.gitlab.noExpiry : expiry === "expired" ? m.account.gitlab.expiredOn(formatDateOnly(expiresAt, uiLocale)) : m.account.gitlab.expires(formatDateOnly(expiresAt, uiLocale)),
        connection.projectCount > 0 ? m.account.gitlab.usedBy(connection.projectCount) : null,
      ].filter((line) => line !== null).join(" ");

  function disconnect() {
    setFailure(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof disconnectGitLab>> | null;
      try { result = await disconnectGitLab(); } catch { result = null; }
      if (result?.ok) router.refresh();
      else setFailure(m.account.gitlab.disconnectFailed);
    });
  }

  return (
    <Card title={m.account.gitlab.title} notice={failure !== null ? <Alert inset variant="danger">{failure}</Alert> : soonNotice !== null ? <Alert inset variant="warning">{soonNotice}</Alert> : undefined}>
      <div ref={body}>
        <CardRows>
          <ListRow
            stackActions
            as="li"
            className="border-border border-t first:border-t-0"
            icon={<IconTile tone={attention ? STATE[state].tone : undefined}>{connected ? <BrandGlyph brand="gitlab" /> : <Link2 className="text-muted-foreground size-4" aria-hidden />}</IconTile>}
            title={<span className="flex min-w-0 items-center gap-2 text-base"><span className="truncate font-medium">{connected ? `@${connection.username}` : m.account.gitlab.rowName}</span><StatusBadge state={state} className="shrink-0" /></span>}
            description={description}
            actions={connected ? <>
              <Dialog open={replacing} onOpenChange={setReplacing}>
                <DialogTrigger asChild>
                  <Button data-gitlab-replace="" variant={attention ? "primary" : undefined}>{m.account.gitlab.replace}</Button>
                </DialogTrigger>
                <DialogContent title={m.account.gitlab.replaceTitle} description={m.account.gitlab.replaceHint(connection.username)}>
                  <GitLabTokenForm autoFocus submitLabel={m.account.gitlab.replace} onConnected={() => { setReplacing(false); router.refresh(); }} />
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="danger" aria-label={m.account.gitlab.disconnectLabel} busy={pending}>{m.settings.account.disconnect}</Button>
                </DialogTrigger>
                <DialogContent
                  title={m.account.gitlab.confirmDisconnect}
                  description={m.account.gitlab.confirmHint}
                  actions={<>
                    <DialogClose asChild><Button data-initial-focus variant="default">{m.common.cancel}</Button></DialogClose>
                    <DialogClose asChild><Button variant="danger" onClick={disconnect}>{m.account.gitlab.disconnectConfirm}</Button></DialogClose>
                  </>}
                />
              </Dialog>
            </> : undefined}
          />
        </CardRows>
        {!connected && (
          // 행 이름선(56 = 여백 16 + 칩 28 + 간격 12)에서 시작하고 구분선이 없다 — 폼이 그 행의 일부다(시안 G8b · #256).
          <div className="pr-4 pb-4 pl-14">
            <GitLabTokenForm submitLabel={m.account.gitlab.form.connect} onConnected={() => router.refresh()} />
          </div>
        )}
      </div>
    </Card>
  );
}
