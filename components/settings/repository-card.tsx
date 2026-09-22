"use client";

import { useState } from "react";
import { ExternalLink, Link2, Unplug } from "lucide-react";
import { GithubIcon } from "@/components/signin/brand-icons";
import { ReconnectButton } from "@/components/reconnect-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import type { AccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { m } from "@/lib/i18n";
import { RepositoryForm } from "./repository-form";

export function RepositoryCard({ slug, owner, repo, branch, archived, health, account, appSlug }: {
  slug: string; owner: string; repo: string; branch: string; archived: boolean; health: ConnectionHealth; account: AccountView; appSlug?: string;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const disconnected = health.status === "app-uninstalled" || health.status === "installation-changed";
  const canConnect = disconnected || health.status === "not-connected" || health.status === "repo-moved";
  const installUrl = installationSettingsUrl(appSlug);
  const recovery = account.status !== "ok" || account.login === null;
  const notice = health.status === "repo-moved" ? <Alert inset variant="warning">{m.settings.repository.health.moved(health.fullName)}</Alert>
    : disconnected || health.status === "repo-replaced" ? <Alert inset variant="danger">{m.settings.repository.health[health.status]}
      {/* ⚠️ 밑줄을 붙이지 않는다 — 나가는 신호는 색과 새 탭이 든다 (DESIGN §6.3, 전역 규칙) */}
      {health.status === "app-uninstalled" && installUrl && <> <a className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={installUrl} target="_blank" rel="noreferrer">{m.settings.repository.health.install}</a> — {m.settings.repository.health.installHint}</>}
    </Alert> : undefined;
  const status = health.status === "ok" || health.status === "repo-moved" ? m.settings.repository.health.ok : disconnected ? m.settings.repository.disconnected : health.status === "not-connected" ? m.settings.repository.notConnected : health.status === "unknown" ? m.settings.repository.unknown : null;
  const detail = health.status === "ok" ? m.settings.installed : health.status === "unknown" ? m.settings.repository.health.unknown : health.status === "not-connected" ? m.settings.repository.health["not-connected"] : health.status === "repo-moved" ? m.settings.repository.movedHint : disconnected ? m.settings.repository.paused : null;
  return <PanelCard title={m.settings.repository.title} subtitle={m.settings.repository.description} notice={failure ? <>{notice}<Alert inset variant="danger">{failure}</Alert></> : notice}>
    <div className="flex items-center gap-3 px-4 py-[13px] @max-[640px]:grid @max-[640px]:grid-cols-[28px_1fr] @max-[640px]:items-start @max-[640px]:[&>fieldset]:col-start-2 @max-[640px]:[&>a]:col-start-2 @max-[640px]:[&>a]:justify-self-start">
      <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded">{disconnected ? <Unplug className="size-4" aria-hidden /> : health.status === "not-connected" ? <Link2 className="size-4" aria-hidden /> : <GithubIcon className="size-4" />}</span>
      <div className="min-w-0 flex-1 space-y-[3px]"><p className="text-base break-all"><span className="font-medium">{owner}/{repo}</span>{status && <> — {status}</>}</p>{detail && <p className="text-muted-foreground text-xs">{detail}</p>}</div>
      {canConnect ? <fieldset className="[&_.animate-spin]:size-3.5" disabled={archived}><ReconnectButton onFailure={setFailure} slug={slug} label={health.status === "not-connected" ? m.settings.repository.connect : m.settings.repository.reconnect} variant={health.status === "repo-moved" ? undefined : "primary"} /></fieldset>
        : health.status === "ok" && <a className={buttonClass({ variant: "default", size: "md" }) + " focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"} href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer">{m.settings.openRepo}<ExternalLink aria-hidden /></a>}
    </div>
    <RepositoryForm slug={slug} baseBranch={branch} disabled={archived} />
    {recovery && <div className="border-divider text-muted-foreground border-t px-4 py-[13px] text-xs">{account.status === "unavailable" ? m.settings.account.unavailable : m.settings.recovery} <ButtonLink variant="link" href="/account">{m.settings.accountLink}</ButtonLink></div>}
  </PanelCard>;
}
