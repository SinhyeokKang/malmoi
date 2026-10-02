"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { Suspense, use, useState } from "react";
import { Link2, Unplug } from "lucide-react";
import { GithubIcon } from "@/components/signin/brand-icons";
import { ReconnectButton } from "@/components/reconnect-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import type { AccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { connectionProblem } from "@/lib/home/state";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { m } from "@/lib/i18n";
import { RepositoryForm } from "./repository-form";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATE } from "@/lib/status/canon";
import { repositoryConnectionState } from "./connection-state";

/**
 * ⚠️ **`health`·`account`가 promise다** (audit-ux #8). 둘 다 GitHub 왕복이라 페이지가 await하면 이 화면 전체가
 * 그만큼 늦게 선다 — 카드 머리와 기준 브랜치 폼(DB 값)은 먼저 서고, **그 둘을 쓰는 세 자리만** Suspense 뒤에서
 * 도착한다: 머리 아래 Alert · 연결 행 · 계정 복구 줄. 같은 promise를 셋이 `use`하므로 한 번에 풀린다.
 */
export function RepositoryCard({ slug, owner, repo, branch, archived, unpinned = false, health, account, appSlug }: {
  slug: string; owner: string; repo: string; branch: string; archived: boolean; unpinned?: boolean; health: Promise<ConnectionHealth>; account: Promise<AccountView>; appSlug?: string;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  // 보관 상태가 오면 옛 거부를 내린다 — 카드가 보관 상태를 대신 말한다 (QA D1).
  const shown = failure && !archived ? failure : null;
  // 머리 아래 선은 `Card`가 notice 아래에 긋는다(2026-10-01 4-Y1) — 비어 도착하는 Suspense notice도 선을 따로 들지 않는다.
  return <Card title={m.settings.repository.title} notice={
    <Suspense fallback={null}><Notice health={health} failure={shown} appSlug={appSlug} /></Suspense>
  }>
    <Suspense fallback={<ConnectionRowPending />}>
      <ConnectionRow health={health} slug={slug} owner={owner} repo={repo} archived={archived} onFailure={setFailure} />
    </Suspense>
    {/* `unpinned`는 DB 값이라 `health`를 기다리지 않는다 — 폼은 GitHub 왕복 없이 먼저 선다. */}
    <RepositoryForm owner={owner} repo={repo} slug={slug} baseBranch={branch} disabled={archived} unpinned={unpinned} />
    {/* 가장 흔한 모양(연결된 계정)에는 이 줄이 없다 — 골격도 없다. 틀리면 두 번 튄다. */}
    <Suspense fallback={null}><Recovery account={account} /></Suspense>
  </Card>;
}

function Notice({ health: pending, failure, appSlug }: { health: Promise<ConnectionHealth>; failure: string | null; appSlug?: string }) {
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
      {/* 줄 칸 높이(24 — 이름 옆 배지 · 16)는 실물 행이 든다. 글자 자리는 `SkeletonLine`이다(4-W8). */}
      <div className="flex h-6 items-center *:flex-1"><SkeletonLine size="md" className="w-[45%]" /></div>
      <div className="flex h-4 items-center *:flex-1"><SkeletonLine size="xs" className="w-[30%]" /></div>
    </div>
    <Skeleton className="h-9 w-32 shrink-0 rounded-md @max-form:col-start-2" />
  </div>;
}

function Recovery({ account: pending }: { account: Promise<AccountView> }) {
  const account = use(pending);
  if (account.status === "ok" && account.login !== null) return null;
  return <div className="border-divider text-muted-foreground border-t px-4 py-row-y text-xs">{account.status === "unavailable" ? m.settings.account.unavailable : m.settings.recovery} <ButtonLink variant="link" href="/account">{m.settings.accountLink}</ButtonLink></div>;
}
