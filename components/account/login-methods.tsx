"use client";

import { useTransition } from "react";

import { unlinkLoginMethod } from "@/app/(edit)/account/actions";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { canUnlink, type LoginProvider } from "@/lib/login-link/policy";
import { providerLabel } from "@/lib/login-link/message";

/**
 * 로그인 수단 목록 — **목록 + 해제만이다** (account-linking design ⑨).
 *
 * ⚠️ **[Connect]가 없다.** 로그인된 세션을 근거로 `Account`를 붙이는 경로는 sec-audit-2 #31이 막은
 * 자리이고, 그 문의 인가 조건(이메일 동등 + 두 provider 소유 증명 + 단일 사용 challenge)을 이
 * 화면에서는 못 적는다. 같은 주소 연결은 흐름 ①이 이미 잡는다 — 로그아웃 후 그 provider로
 * 로그인하면 병합 화면이 뜬다.
 *
 * ⚠️ **마지막 수단은 비활성 + 행 옆 인라인 사유다** — 사유 없는 disabled는 이 리포가 반복해 밟은
 * 부류이고(POSTMORTEM 2026-09-06), 관용구는 멤버 화면의 행 옆 인라인이다.
 */
export function LoginMethods({ rows }: { rows: readonly { provider: LoginProvider; connected: boolean }[] }) {
  const connected = rows.filter((row) => row.connected).map((row) => row.provider);
  const [pending, startTransition] = useTransition();

  return (
    <ul className="divide-border divide-y">
      {rows.map((row) => {
        const label = providerLabel(row.provider);
        const removable = canUnlink(connected, row.provider);
        return (
          <li key={row.provider} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            {/* 브랜드 마크는 무채색 위계의 대상이 아니다 — `--foreground`를 그대로 받는다. */}
            {row.provider === "github" ? <GithubIcon className="size-4 shrink-0" /> : <GoogleIcon className="size-4 shrink-0" />}
            <span className="flex-1 text-sm">{label}</span>
            {!row.connected ? (
              <span className="text-muted-foreground text-xs">{m.link.methods.notConnected}</span>
            ) : removable ? (
              <DisconnectButton
                label={label}
                pending={pending}
                onConfirm={() => startTransition(async () => { await unlinkLoginMethod(row.provider); })}
              />
            ) : (
              <>
                <span className="text-muted-foreground text-xs">{m.link.methods.lastMethod}</span>
                <Button variant="ghost" disabled={true}>
                  {m.link.methods.disconnect}
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * ⚠️ **`DisconnectGithubButton`과 달리 확인을 받는다** — 그쪽은 다시 누르면 복구되는 GitHub App
 * 연결이고, 로그인 수단 해제는 되돌리려면 OAuth 왕복 전체가 필요하다. 멤버 제거와 같은 무게다.
 */
function DisconnectButton({
  label,
  pending,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* `aria-label`이 보이는 텍스트를 **포함**한다 — 음성 입력이 라벨로 컨트롤을 찾는다 (WCAG 2.5.3). */}
        <Button variant="ghost" aria-label={`${m.link.methods.disconnect} ${label}`} loading={pending}>
          {m.link.methods.disconnect}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={m.link.methods.confirmDisconnect(label)}
        description={m.link.methods.confirmHint}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="default">{m.members.cancel}</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" onClick={onConfirm}>
                {m.link.methods.disconnect}
              </Button>
            </DialogClose>
          </>
        }
      />
    </Dialog>
  );
}
