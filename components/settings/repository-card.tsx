"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { Suspense, use, useState } from "react";
import { Link2, Unplug } from "lucide-react";
import { GithubIcon, GitlabIcon } from "@/components/signin/brand-icons";
import { GitLabTokenForm } from "@/components/gitlab/token-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { formatDay } from "@/lib/date-format";
import { repoWebUrl } from "@/lib/projects/repo-web";
import { tokenExpiryState } from "@/lib/status/token-expiry";
import { ReconnectButton } from "@/components/reconnect-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { connectionProblem, repositoryConnectionState } from "@/lib/home/state";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import { RepositoryForm } from "./repository-form";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATE } from "@/lib/status/canon";

/**
 * ⚠️ **`health`·`account`가 promise다** (audit-ux #8). 둘 다 GitHub 왕복이라 페이지가 await하면 이 화면 전체가
 * 그만큼 늦게 선다 — 카드 머리와 기준 브랜치 폼(DB 값)은 먼저 서고, **그 둘을 쓰는 세 자리만** Suspense 뒤에서
 * 도착한다: 머리 아래 Alert · 연결 행 · 계정 복구 줄. 같은 promise를 셋이 `use`하므로 한 번에 풀린다.
 */
/**
 * GitLab 프로젝트의 연결 맥락 (시안 G6 · design §2 "GitLab 연결") — DB 값이다(원격 호출 0). `token`은 프로젝트가 참조하는 연결(토큰 주인)이고
 * 참조가 비었으면 `null`이다(D21). `viewer`는 보는 사람(설정 = OWNER)의 계정 GitLab 연결 — 재연결은 그 연결로 참조를 바꾼다(명의가 바뀐다).
 */
export type GitLabCardContext = {
  token: { username: string; expiresAt: string | null; viewerIsOwner: boolean } | null;
  viewer: { username: string } | null;
};

export function RepositoryCard({ slug, owner, repo, branch, archived, unpinned = false, health, account, appSlug, gitlab }: {
  slug: string; owner: string; repo: string; branch: string; archived: boolean; unpinned?: boolean; health: Promise<ConnectionHealth>;
  /** GitHub 계정 복구 줄의 근거 — GitLab 프로젝트는 쓰지 않는다(`gitlab`이 있으면 GitHub 조회를 하지 않는다). */
  account?: Promise<AccountView>; appSlug?: string;
  /** 있으면 GitLab 프로젝트다 — 연결 행·토큰 줄·재연결이 GitLab 형이다. GitHub 카드는 지금 그대로다. */
  gitlab?: GitLabCardContext;
}) {
  const m = useMessages();
  const [failure, setFailure] = useState<string | null>(null);
  // 보관 상태가 오면 옛 거부를 내린다 — 카드가 보관 상태를 대신 말한다 (QA D1).
  const shown = failure && !archived ? failure : null;
  // 머리 아래 선은 `Card`가 notice 아래에 긋는다(2026-10-01 4-Y1) — 비어 도착하는 Suspense notice도 선을 따로 들지 않는다.
  if (gitlab !== undefined) return <Card title={m.settings.repository.title} notice={
    <Suspense fallback={null}><GitLabNotice health={health} failure={shown} /></Suspense>
  }>
    <Suspense fallback={<ConnectionRowPending />}>
      <GitLabConnectionRow health={health} slug={slug} owner={owner} repo={repo} archived={archived} gitlab={gitlab} onFailure={setFailure} />
    </Suspense>
    <RepositoryForm owner={owner} repo={repo} slug={slug} baseBranch={branch} disabled={archived} unpinned={unpinned} />
  </Card>;
  return <Card title={m.settings.repository.title} notice={
    <Suspense fallback={null}><Notice health={health} failure={shown} appSlug={appSlug} /></Suspense>
  }>
    <Suspense fallback={<ConnectionRowPending />}>
      <ConnectionRow health={health} slug={slug} owner={owner} repo={repo} archived={archived} onFailure={setFailure} />
    </Suspense>
    {/* `unpinned`는 DB 값이라 `health`를 기다리지 않는다 — 폼은 GitHub 왕복 없이 먼저 선다. */}
    <RepositoryForm owner={owner} repo={repo} slug={slug} baseBranch={branch} disabled={archived} unpinned={unpinned} />
    {/* 가장 흔한 모양(연결된 계정)에는 이 줄이 없다 — 골격도 없다. 틀리면 두 번 튄다. */}
    {account !== undefined && <Suspense fallback={null}><Recovery account={account} /></Suspense>}
  </Card>;
}

/** GitLab 끊김 사유 둘(D21·D22) — 참조가 빈 것과 토큰을 못 쓰는 것. 같은 Disconnected 톤(호박)이고 문장이 원인을 가른다. */
function GitLabNotice({ health: pending, failure }: { health: Promise<ConnectionHealth>; failure: string | null }) {
  const m = useMessages();
  const health = use(pending);
  const reason = health.status === "connection-removed" ? m.settings.repository.gitlab.removed : health.status === "connection-unusable" ? m.settings.repository.gitlab.unusable : null;
  if (reason === null && failure === null) return null;
  return <>{reason !== null && <Alert inset variant="warning">{reason}</Alert>}{failure !== null && <Alert inset variant="danger">{failure}</Alert>}</>;
}

/**
 * GitLab 연결 행 + 토큰 줄 + 재연결 (시안 G6a~e). 행은 "Sync·Publish가 도나"(프로젝트 Connection — `repositoryConnectionState`), 토큰 줄은
 * "토큰이 어떤가"(만료 임박 `expiresSoon` · 지남 `expired`)다 — 두 자리가 다른 질문이다(design §2 톤 표).
 *
 * 복구는 보는 사람이 가른다(design-brief v4·v5): 토큰 주인 → [Replace token](참조하는 프로젝트 전부) · 다른 OWNER이고 연결 있음 →
 * [Use my GitLab connection](명의 변경 문장이 앞에 선다) · 연결 없음 → PAT 입력(계정 연결을 만든 뒤 위 버튼). ⚠️ GitHub `connectRepository`를 부르지 않는다.
 * ⚠️ 긴 하위 그룹 주소는 `break-all`로 감긴다 — 잘리지 않아 이름 끝이 보인다(375).
 */
function GitLabConnectionRow({ health: pending, slug, owner, repo, archived, gitlab, onFailure }: {
  health: Promise<ConnectionHealth>; slug: string; owner: string; repo: string; archived: boolean; gitlab: GitLabCardContext; onFailure: (message: string | null) => void;
}) {
  const m = useMessages();
  const style = useDateStyle();
  const router = useRouter();
  const [replacing, setReplacing] = useState(false);
  const health = use(pending);
  const problem = connectionProblem(health.status);
  const state = repositoryConnectionState(health.status, problem);
  const { token, viewer } = gitlab;
  const expiresAt = token?.expiresAt == null ? null : new Date(token.expiresAt);
  const expiry = tokenExpiryState(expiresAt, new Date());
  // 끊김이거나 토큰이 곧(또는 이미) 만료면 복구를 보인다 — 연결 정상 + 만료 먼 토큰은 [Open on GitLab]뿐이다.
  const recover = problem !== null || expiry !== "valid";
  const detail = health.status === "unknown" ? m.settings.repository.health.unknown
    : problem !== null ? m.settings.repository.paused
    : token !== null ? m.settings.repository.gitlab.connectedVia(token.username) : null;
  return <>
    <div className={ROW}>
      <IconTile tone={STATE[state].tone}>{problem === "disconnected" ? <Unplug className="size-4" aria-hidden /> : <GitlabIcon className="size-4" />}</IconTile>
      <div className="min-w-0 flex-1 space-y-copy-gap"><p className="text-base break-all"><span className="font-medium">{owner}/{repo}</span><StatusBadge state={state} className="ml-2 align-middle" /></p>{detail && <p className="text-muted-foreground text-xs">{detail}</p>}</div>
      {health.status === "ok" && <ButtonLink variant="default" size="md" external href={repoWebUrl("gitlab", owner, repo)} newTab rel="noreferrer">{m.settings.openRepo}</ButtonLink>}
    </div>
    {token !== null && (
      <div className={ROW}>
        <IconTile tone={expiry === "valid" ? undefined : "warning"}><GitlabIcon className="size-4" /></IconTile>
        <div className="min-w-0 flex-1 space-y-copy-gap">
          <p className="text-base break-all"><span className="font-medium">{m.settings.repository.gitlab.tokenLine(token.username)}</span>
            {expiry !== "valid" && <StatusBadge state={expiry === "expired" ? "expired" : "expiresSoon"} className="ml-2 align-middle" />}</p>
          <p className="text-muted-foreground text-xs">{expiresAt === null ? m.account.gitlab.noExpiry : expiry === "expired" ? m.account.gitlab.expiredOn(formatDay(expiresAt, style)) : m.account.gitlab.expires(formatDay(expiresAt, style))}</p>
        </div>
        {token.viewerIsOwner && (
          <fieldset disabled={archived}>
            <Dialog open={replacing} onOpenChange={setReplacing}>
              <DialogTrigger asChild><Button>{m.account.gitlab.replace}</Button></DialogTrigger>
              <DialogContent title={m.account.gitlab.replaceTitle} description={m.account.gitlab.replaceHint(token.username)}>
                <GitLabTokenForm autoFocus submitLabel={m.account.gitlab.replace} onConnected={() => { setReplacing(false); router.refresh(); }} />
              </DialogContent>
            </Dialog>
          </fieldset>
        )}
      </div>
    )}
    {recover && !token?.viewerIsOwner && (
      <div className="border-divider space-y-3 border-t px-4 py-row-y">
        {viewer !== null ? <>
          <p className="text-muted-foreground text-xs">{m.settings.repository.gitlab.useMineHint(token?.username ?? null, viewer.username)}</p>
          <fieldset disabled={archived}><ReconnectButton host="gitlab" spinnerSize="sm" onFailure={onFailure} slug={slug} server={health} label={m.settings.repository.gitlab.useMine} variant="primary" /></fieldset>
        </> : <>
          <p className="text-muted-foreground text-xs">{m.settings.repository.gitlab.connectFirst}</p>
          <fieldset disabled={archived}><GitLabTokenForm submitLabel={m.account.gitlab.form.connect} onConnected={() => router.refresh()} /></fieldset>
        </>}
      </div>
    )}
  </>;
}

function Notice({ health: pending, failure, appSlug }: { health: Promise<ConnectionHealth>; failure: string | null; appSlug?: string }) {
  const m = useMessages();
  const health = use(pending);
  const installUrl = installationSettingsUrl(appSlug);
  const notice = health.status === "repo-moved" ? <Alert inset variant="warning">{m.settings.repository.health.moved(health.fullName)}</Alert>
    // 연결 끊김(재연결 필요)은 호박, 다른 리포를 가리키는 것은 빨강이다 — 행 배지와 같은 톤(2026-09-30 상태 통일).
    : health.status === "app-uninstalled" || health.status === "installation-changed" || health.status === "repo-replaced" ? <Alert inset variant={health.status === "repo-replaced" ? "danger" : "warning"}>{m.settings.repository.health[health.status]}
      {/* ⚠️ 밑줄을 붙이지 않는다 — 나가는 신호는 색과 새 탭이 든다 (DESIGN §6.3, 전역 규칙) */}
      {health.status === "app-uninstalled" && installUrl && <> <InlineLink href={installUrl} target="_blank" rel="noreferrer">{m.settings.repository.health.install}</InlineLink> — {m.settings.repository.health.installHint}</>}
    </Alert> : undefined;
  if (notice === undefined && failure === null) return null;
  return <>{notice}{failure !== null && <Alert inset variant="danger">{failure}</Alert>}</>;
}

const ROW = "flex items-center gap-3 px-4 py-row-y @max-form:grid @max-form:grid-cols-[28px_1fr] @max-form:items-start @max-form:[&>fieldset]:col-start-2 @max-form:[&>a]:col-start-2 @max-form:[&>a]:justify-self-start";

function ConnectionRow({ health: pending, slug, owner, repo, archived, onFailure }: {
  health: Promise<ConnectionHealth>; slug: string; owner: string; repo: string; archived: boolean; onFailure: (message: string | null) => void;
}) {
  const m = useMessages();
  const health = use(pending);
  /*
    끊김·미연결·다른 리포의 판정은 Home과 같은 함수다(ux-drift-unify D1) — 설치는 있고 리포 id가 없는 `unpinned`가 목록·Home과
    같은 Disconnected(재연결 필요)로 선다. `repo-moved`·`unknown`만 이 카드가 덧붙인다.
  */
  const problem = connectionProblem(health.status);
  const disconnected = problem === "disconnected";
  const canConnect = disconnected || problem === "not-connected" || health.status === "repo-moved";
  // 배지와 아이콘 칸이 같은 상태 키다(1-Y15) — 연결됨 초록 · 끊김·확인 실패 호박 · 미연결 회색 · 다른 리포 빨강(§2.4).
  const state = repositoryConnectionState(health.status, problem);
  const detail = health.status === "ok" ? m.settings.installed : health.status === "unknown" ? m.settings.repository.health.unknown : problem === "not-connected" ? m.settings.repository.health["not-connected"] : health.status === "repo-moved" ? m.settings.repository.movedHint : disconnected ? m.settings.repository.paused : null;
  return <div className={ROW}>
    <IconTile tone={STATE[state].tone}>{disconnected ? <Unplug className="size-4" aria-hidden /> : problem === "not-connected" ? <Link2 className="size-4" aria-hidden /> : <GithubIcon className="size-4" />}</IconTile>
    <div className="min-w-0 flex-1 space-y-copy-gap"><p className="text-base break-all"><span className="font-medium">{owner}/{repo}</span><StatusBadge state={state} className="ml-2 align-middle" /></p>{detail && <p className="text-muted-foreground text-xs">{detail}</p>}</div>
    {canConnect ? <fieldset disabled={archived}><ReconnectButton spinnerSize="sm" onFailure={onFailure} slug={slug} server={health} label={problem === "not-connected" ? m.settings.repository.connect : m.settings.repository.reconnect} variant={health.status === "repo-moved" ? undefined : "primary"} /></fieldset>
      : health.status === "ok" && <ButtonLink variant="default" size="md" external href={`https://github.com/${owner}/${repo}`} newTab rel="noreferrer">{m.settings.openRepo}</ButtonLink>}
  </div>;
}

/**
 * 연결 행의 골격 — **가장 흔한 모양(`ok`)과 같은 치수다**: 글리프 28 · 본문 24 + 보조 16(간격 3) · 우측 `md` 버튼.
 * 다르면 도착하는 순간 아래 폼이 밀린다. ⚠️ **`aria-busy`가 행에 있다** — 골격 블록은 `aria-hidden`이라 스크린리더에는
 * 빈 자리가 되고, 그 자리가 "아직 오는 중"임을 이것이 말한다.
 */
function ConnectionRowPending() {
  return <div className={ROW} aria-busy="true" data-connection-pending="">
    <Skeleton className="size-7 shrink-0 rounded" />
    <div className="min-w-0 flex-1 space-y-copy-gap">
      {/* 줄 칸 높이(24 — 이름 옆 배지 · 16)는 실물 행이 든다. 글자 자리는 `Skeleton`이다(4-W8). */}
      <div className="flex h-6 items-center *:flex-1"><Skeleton size="md" className="w-[45%]" /></div>
      <div className="flex h-4 items-center *:flex-1"><Skeleton size="xs" className="w-[30%]" /></div>
    </div>
    <Skeleton className="h-9 w-32 shrink-0 rounded-md @max-form:col-start-2" />
  </div>;
}

function Recovery({ account: pending }: { account: Promise<AccountView> }) {
  const m = useMessages();
  const account = use(pending);
  if (account.status === "ok" && account.login !== null) return null;
  return <div className="border-divider text-muted-foreground border-t px-4 py-row-y text-xs">{account.status === "unavailable" ? m.settings.account.unavailable : m.settings.recovery} <ButtonLink variant="link" href="/account">{m.settings.accountLink}</ButtonLink></div>;
}
