"use client";

import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import type { ConnectOutcome } from "@/lib/account-connect/plan";
import { useTransition } from "react";

import { unlinkLoginMethod, startLoginMethodConnect } from "@/app/(edit)/account/actions";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { canUnlink, type LoginProvider } from "@/lib/login-link/policy";
import { providerLabel } from "@/lib/login-link/message";

/** Add uses the live session plus an isolated OAuth challenge; each row owns its pending state. */
export function LoginMethods({ rows, outcome = null }: { rows: readonly { provider: LoginProvider; connected: boolean }[]; outcome?: ConnectOutcome | null }) {
  const connected = rows.filter(row => row.connected).map(row => row.provider);
  return <div className="space-y-3">
    {outcome !== null && <Alert variant={outcome === "connected" ? "success" : "danger"} role={outcome === "connected" ? "status" : undefined}>{m.errors.connectMethod[outcome]}</Alert>}
    <ul className="divide-border divide-y">
      {rows.map(row => <MethodRow key={row.provider} row={row} removable={canUnlink(connected, row.provider)} />)}
    </ul>
  </div>;
}
function MethodRow({ row, removable }: { row: { provider: LoginProvider; connected: boolean }; removable: boolean }) {
  const [pending, startTransition] = useTransition();
  const label = providerLabel(row.provider);
  return <li className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
    {row.provider === "github" ? <GithubIcon className="size-4 shrink-0" /> : <GoogleIcon className="size-4 shrink-0" />}
    <span className="flex-1 text-sm">{label}</span>
    {!row.connected ? <>
      <span className="text-muted-foreground text-xs">{m.link.methods.notConnected}</span>
      <form action={startLoginMethodConnect.bind(null, row.provider)}><AddButton label={label} /></form>
    </> : removable ? <DisconnectButton label={label} pending={pending} onConfirm={() => startTransition(async () => { await unlinkLoginMethod(row.provider); })} /> : <>
      <span className="text-muted-foreground text-xs">{m.link.methods.lastMethod}</span>
      <Button variant="ghost" disabled={true}>{m.link.methods.disconnect}</Button>
    </>}
  </li>;
}
function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="ghost" loading={pending}>{m.link.methods.add(label)}</Button>;
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
