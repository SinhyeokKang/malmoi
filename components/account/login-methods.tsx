"use client";

import { useFormStatus } from "react-dom";
import { useId, useTransition } from "react";

import { unlinkLoginMethod, startLoginMethodConnect } from "@/app/(edit)/account/actions";
import { AccountRow, AccountSection } from "@/components/account/account-section";
import type { ConnectOutcome } from "@/lib/account-connect/plan";
import { Alert } from "@/components/ui/alert";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { canUnlink, type LoginProvider } from "@/lib/login-link/policy";
import { providerLabel } from "@/lib/login-link/message";

/**
 * Sign-in methods 구역 — **행이 언제나 둘이고 순서가 고정이다** (`loginMethodRows`).
 *
 * ⚠️ **구역 전체를 든다** (`SessionsSection`과 같은 형). 왕복 결과 Alert가 **헤더 아래·리스트 위**에
 * 서야 하고 그 자리는 리스트 래퍼 바깥이라, 구역을 화면이 조립하면 Alert의 자리가 두 컴포넌트에
 * 걸친다.
 */
export function LoginMethods({ rows, outcome = null }: {
  rows: readonly { provider: LoginProvider; connected: boolean }[];
  outcome?: ConnectOutcome | null;
}) {
  const connected = rows.filter((row) => row.connected).map((row) => row.provider);
  return (
    <AccountSection
      title={m.link.methods.title}
      subtitle={m.link.methods.description}
      notice={outcome !== null
        ? <Alert variant={outcome === "connected" ? "success" : "danger"} role={outcome === "connected" ? "status" : undefined}>{m.errors.connectMethod[outcome]}</Alert>
        : undefined}
    >
      {rows.map((row) => (
        <MethodRow key={row.provider} row={row} removable={canUnlink(connected, row.provider)} />
      ))}
    </AccountSection>
  );
}

function MethodRow({ row, removable }: { row: { provider: LoginProvider; connected: boolean }; removable: boolean }) {
  const [pending, startTransition] = useTransition();
  const label = providerLabel(row.provider);
  /**
   * ⚠️ **사유가 화면에만 있으면 절반만 지킨 것이다.** 옆에 선 문구를 `aria-describedby`로 묶지
   * 않으면 스크린리더는 *"…, 버튼, 사용 불가"*까지만 읽고 **왜인지는 못 읽는다** — "사유 없는
   * `disabled`를 만들지 않는다"(POSTMORTEM 2026-09-06)가 그 사용자에게만 안 지켜진다.
   */
  const reasonId = useId();
  return (
    <AccountRow
      // 브랜드 마크는 무채색 위계의 대상이 아니라 `--foreground`를 그대로 받는다 (DESIGN §6.4).
      glyph={row.provider === "github" ? <GithubIcon className="size-4" /> : <GoogleIcon className="size-4" />}
      name={label}
      detail={row.connected ? m.link.methods.connected : m.link.methods.notConnected}
    >
      {!row.connected ? (
        <form action={startLoginMethodConnect.bind(null, row.provider)}>
          <ConnectButton label={label} />
        </form>
      ) : removable ? (
        <DisconnectButton
          label={label}
          pending={pending}
          onConfirm={() => startTransition(async () => { await unlinkLoginMethod(row.provider); })}
        />
      ) : (
        <>
          {/* ⚠️ **사유 없는 `disabled`를 만들지 않는다** (POSTMORTEM 2026-09-06). */}
          <span id={reasonId} className="text-muted-foreground text-xs">{m.link.methods.lastMethod}</span>
          {/* ⚠️ **비활성도 접근성 트리에는 남는다** — 이름이 없으면 무엇의 해제인지 말하지 않는다. */}
          <Button variant="default" aria-label={m.link.methods.disconnectLabel(label)} aria-describedby={reasonId} disabled={true}>{m.link.methods.disconnect}</Button>
        </>
      )}
    </AccountRow>
  );
}

function ConnectButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  // `aria-label`이 보이는 텍스트를 **포함**한다 — 음성 입력이 라벨로 컨트롤을 찾는다 (WCAG 2.5.3).
  return (
    <Button type="submit" variant="default" aria-label={m.link.methods.connectLabel(label)} loading={pending}>
      {m.link.methods.connect}
    </Button>
  );
}

/**
 * ⚠️ **이 화면의 되돌릴 수 없는 넷이 전부 확인을 받는다** (2026-09-13).
 *
 * 그 전엔 이 자리만 Dialog가 있었고 주석이 그 비대칭을 *"`DisconnectGithubButton`과 달리 확인을
 * 받는다 — 그쪽은 **다시 누르면 복구되는** GitHub App 연결이고, 로그인 수단 해제는 되돌리려면
 * OAuth 왕복 전체가 필요하다"*로 정당화했다. **그 판단을 뒤집었다**: 복구가 쉬운 것과 결과가
 * 가벼운 것은 다른 축이고, **되돌리는 비용이 양쪽 다 OAuth 왕복 전체**다.
 *
 * ⚠️ **2026-09-14 정정** — 뒤집는 근거로 *"GitHub 연결 해제는 내가 OWNER인 모든 프로젝트의 발송을
 * 멈춘다"*와 그 화면 쪽 짝인 `N projects use this connection.` 한 줄을 들었는데 **둘 다 폐기됐다**:
 * 야간 pull·PR은 App **설치 토큰**이 내므로 해제 뒤에도 그대로 돌고, 그 집계 줄은 이 연결에
 * 의존하지 않는 프로젝트까지 세고 있어 함께 걷었다. **Dialog는 남는다** — 근거가 위의 왕복 비용이다.
 */
function DisconnectButton({ label, pending, onConfirm }: { label: string; pending: boolean; onConfirm: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default" aria-label={m.link.methods.disconnectLabel(label)} loading={pending}>
          {m.link.methods.disconnect}
        </Button>
      </DialogTrigger>
      <DialogContent
        // 제목이 대상을 명시한다 — 이 화면에 같은 라벨의 [Disconnect]가 둘이다.
        title={m.link.methods.confirmDisconnect(label)}
        description={m.link.methods.confirmHint}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="default">{m.common.cancel}</Button>
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
