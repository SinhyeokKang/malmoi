"use client";

import { Suspense, use, useState } from "react";
import { ExternalLink, Link2, Unplug } from "lucide-react";
import { GithubIcon } from "@/components/signin/brand-icons";
import { ReconnectButton } from "@/components/reconnect-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { m } from "@/lib/i18n";
import { RepositoryForm } from "./repository-form";

/**
 * ⚠️ **`health`·`account`가 promise다** (audit-ux #8). 둘 다 GitHub 왕복이라 페이지가 await하면 이 화면 전체가
 * 그만큼 늦게 선다 — 카드 머리와 기준 브랜치 폼(DB 값)은 먼저 서고, **그 둘을 쓰는 세 자리만** Suspense 뒤에서
 * 도착한다: 머리 아래 Alert · 연결 행 · 계정 복구 줄. 같은 promise를 셋이 `use`하므로 한 번에 풀린다.
 */
export function RepositoryCard({ slug, owner, repo, branch, archived, health, account, appSlug }: {
  slug: string; owner: string; repo: string; branch: string; archived: boolean; health: Promise<ConnectionHealth>; account: Promise<AccountView>; appSlug?: string;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  // 보관 상태가 오면 옛 거부를 내린다 — 카드가 보관 상태를 대신 말한다 (QA D1).
  const shown = failure && !archived ? failure : null;
  /*
    ⚠️ **`notice`가 언제나 요소다** — `PanelCard`는 `notice === undefined`일 때만 머리에 `border-b`를 긋는데, Suspense
    요소는 내용이 없어도 undefined가 아니다. 그래서 선을 이 자리가 대신 긋는다(inset Alert의 `border-t`와 같은 1px).
  */
  return <PanelCard title={m.settings.repository.title} subtitle={m.settings.repository.description} notice={
    <Suspense fallback={<Divider />}><Notice health={health} failure={shown} appSlug={appSlug} /></Suspense>
  }>
    <Suspense fallback={<ConnectionRowPending />}>
      <ConnectionRow health={health} slug={slug} owner={owner} repo={repo} archived={archived} onFailure={setFailure} />
    </Suspense>
    <RepositoryForm owner={owner} repo={repo} slug={slug} baseBranch={branch} disabled={archived} />
    {/* 가장 흔한 모양(연결된 계정)에는 이 줄이 없다 — 골격도 없다. 틀리면 두 번 튄다. */}
    <Suspense fallback={null}><Recovery account={account} /></Suspense>
  </PanelCard>;
}

function Divider() {
  return <div className="border-divider border-t" />;
}

function isDisconnected(health: ConnectionHealth): boolean {
  return health.status === "app-uninstalled" || health.status === "installation-changed";
}

function Notice({ health: pending, failure, appSlug }: { health: Promise<ConnectionHealth>; failure: string | null; appSlug?: string }) {
  const health = use(pending);
  const installUrl = installationSettingsUrl(appSlug);
  const notice = health.status === "repo-moved" ? <Alert inset variant="warning">{m.settings.repository.health.moved(health.fullName)}</Alert>
    : isDisconnected(health) || health.status === "repo-replaced" ? <Alert inset variant="danger">{m.settings.repository.health[health.status]}
      {/* ⚠️ 밑줄을 붙이지 않는다 — 나가는 신호는 색과 새 탭이 든다 (DESIGN §6.3, 전역 규칙) */}
      {health.status === "app-uninstalled" && installUrl && <> <a className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={installUrl} target="_blank" rel="noreferrer">{m.settings.repository.health.install}</a> — {m.settings.repository.health.installHint}</>}
    </Alert> : undefined;
  if (notice === undefined && failure === null) return <Divider />;
  return <>{notice}{failure !== null && <Alert inset variant="danger">{failure}</Alert>}</>;
}

const ROW = "flex items-center gap-3 px-4 py-[13px] @max-[640px]:grid @max-[640px]:grid-cols-[28px_1fr] @max-[640px]:items-start @max-[640px]:[&>fieldset]:col-start-2 @max-[640px]:[&>a]:col-start-2 @max-[640px]:[&>a]:justify-self-start";

function ConnectionRow({ health: pending, slug, owner, repo, archived, onFailure }: {
  health: Promise<ConnectionHealth>; slug: string; owner: string; repo: string; archived: boolean; onFailure: (message: string | null) => void;
}) {
  const health = use(pending);
  const disconnected = isDisconnected(health);
  const canConnect = disconnected || health.status === "not-connected" || health.status === "repo-moved";
  const status = health.status === "ok" || health.status === "repo-moved" ? m.settings.repository.health.ok : disconnected ? m.settings.repository.disconnected : health.status === "not-connected" ? m.settings.repository.notConnected : health.status === "unknown" ? m.settings.repository.unknown : null;
  const detail = health.status === "ok" ? m.settings.installed : health.status === "unknown" ? m.settings.repository.health.unknown : health.status === "not-connected" ? m.settings.repository.health["not-connected"] : health.status === "repo-moved" ? m.settings.repository.movedHint : disconnected ? m.settings.repository.paused : null;
  return <div className={ROW}>
    <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded">{disconnected ? <Unplug className="size-4" aria-hidden /> : health.status === "not-connected" ? <Link2 className="size-4" aria-hidden /> : <GithubIcon className="size-4" />}</span>
    <div className="min-w-0 flex-1 space-y-[3px]"><p className="text-base break-all"><span className="font-medium">{owner}/{repo}</span>{status && <> — {status}</>}</p>{detail && <p className="text-muted-foreground text-xs">{detail}</p>}</div>
    {canConnect ? <fieldset className="[&_.animate-spin]:size-3.5" disabled={archived}><ReconnectButton onFailure={onFailure} slug={slug} label={health.status === "not-connected" ? m.settings.repository.connect : m.settings.repository.reconnect} variant={health.status === "repo-moved" ? undefined : "primary"} /></fieldset>
      : health.status === "ok" && <a className={buttonClass({ variant: "default", size: "md" }) + " focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"} href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer">{m.settings.openRepo}<ExternalLink aria-hidden /></a>}
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
    <div className="min-w-0 flex-1 space-y-[3px]">
      <span className="flex h-6 items-center"><Skeleton className="h-4 w-[45%] rounded-md" /></span>
      <span className="flex h-4 items-center"><Skeleton className="h-3 w-[30%] rounded-md" /></span>
    </div>
    <Skeleton className="h-9 w-32 shrink-0 rounded-md @max-[640px]:col-start-2" />
  </div>;
}

function Recovery({ account: pending }: { account: Promise<AccountView> }) {
  const account = use(pending);
  if (account.status === "ok" && account.login !== null) return null;
  return <div className="border-divider text-muted-foreground border-t px-4 py-[13px] text-xs">{account.status === "unavailable" ? m.settings.account.unavailable : m.settings.recovery} <ButtonLink variant="link" href="/account">{m.settings.accountLink}</ButtonLink></div>;
}
