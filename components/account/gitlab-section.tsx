"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { disconnectGitLab } from "@/app/(edit)/account/actions";
import { GitLabTokenForm } from "@/components/gitlab/token-form";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import { GitlabIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardRows } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { landFocus } from "@/components/ui/focus";
import { IconTile } from "@/components/ui/icon-tile";
import { ListRow } from "@/components/ui/list-row";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDay } from "@/lib/date-format";
import type { StateKey } from "@/lib/status/canon";
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
  const style = useDateStyle();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [pending, startTransition] = useTransition();
  const connected = connection !== null;

  // 해제가 성공하면 누른 버튼이 사라진다 — 남는 입력으로 포커스를 옮긴다(`GithubSection`과 같은 전이 처리, audit #32).
  const body = useRef<HTMLDivElement>(null);
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (wasConnected.current && !connected) landFocus(body.current?.querySelector<HTMLElement>("input, button"));
    wasConnected.current = connected;
  }, [connected]);

  const expiresAt = connection?.expiresAt == null ? null : new Date(connection.expiresAt);
  const expiry = tokenExpiryState(expiresAt, new Date());
  const state: StateKey = !connected ? "notConnected" : expiry === "expired" ? "expired" : expiry === "expiresSoon" ? "expiresSoon" : "connected";
  const description = !connected
    ? m.account.gitlab.hintNotConnected
    : [
        expiresAt === null ? m.account.gitlab.noExpiry : expiry === "expired" ? m.account.gitlab.expiredOn(formatDay(expiresAt, style)) : m.account.gitlab.expires(formatDay(expiresAt, style)),
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
    <Card title={m.account.gitlab.title} notice={failure !== null ? <Alert inset variant="danger">{failure}</Alert> : undefined}>
      <div ref={body}>
        <CardRows>
          <ListRow
            stackActions
            as="li"
            className="border-border border-t first:border-t-0"
            icon={<IconTile>{connected ? <GitlabIcon className="size-4" /> : <Link2 className="text-muted-foreground size-4" aria-hidden />}</IconTile>}
            title={<span className="flex min-w-0 items-center gap-2 text-base"><span className="truncate font-medium">{connected ? `@${connection.username}` : m.account.gitlab.rowName}</span><StatusBadge state={state} className="shrink-0" /></span>}
            description={description}
            actions={connected ? <>
              <Dialog open={replacing} onOpenChange={setReplacing}>
                <DialogTrigger asChild>
                  <Button>{m.account.gitlab.replace}</Button>
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
                    <DialogClose asChild><Button variant="danger" onClick={disconnect}>{m.settings.account.disconnectConfirm}</Button></DialogClose>
                  </>}
                />
              </Dialog>
            </> : undefined}
          />
        </CardRows>
        {!connected && (
          <div className="border-divider border-t px-4 py-4">
            <GitLabTokenForm submitLabel={m.account.gitlab.form.connect} onConnected={() => router.refresh()} />
          </div>
        )}
      </div>
    </Card>
  );
}
