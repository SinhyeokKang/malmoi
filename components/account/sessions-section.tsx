"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { startSessionRevocation } from "@/app/(edit)/account/actions";
import { AccountRow, AccountSection } from "@/components/account/account-section";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { sessionRevocationMessage } from "@/lib/session-revocation/message";

/**
 * Sessions 구역 — **항목 둘이 한 리스트다** (account-settings 태스크 4).
 *
 * ⚠️ **Sign out이 위다.** 전에는 "Sign out everywhere" 카드가 먼저였는데, 흔한 쪽이 아래에 있으면
 * 사용자가 되돌릴 수 없는 쪽을 먼저 읽는다.
 *
 * ⚠️ **구역 전체가 클라이언트다** — `?sessionRevocation=`의 문구와 제출 실패 문구가 **같은 자리**에
 * 서야 하고(구역 Alert), 제출 상태는 여기서만 안다. 나눠 두면 실패가 Dialog와 함께 사라진다.
 */
export function SessionsSection({ outcome, signOut, confirmProvider }: {
  /** 주소창 값이다 — union이 아니라 `string | undefined`로 받고 판정 함수가 거른다. */
  outcome: string | undefined;
  signOut: () => void;
  /** 확인 상대는 서버가 결정적으로 고른다(`pickLoginAccount`) — 화면은 그 이름만 쓴다. */
  confirmProvider: string | null;
}) {
  const [failed, submit, pending] = useActionState(async () => {
    await startSessionRevocation();
    return true;
  }, false);
  // 제출 실패는 `?sessionRevocation=invalid`·`=unavailable`과 같은 문구로 접힌다 — 할 일이 같다.
  const message = failed ? m.account.sessions.failed : sessionRevocationMessage(outcome);

  return (
    <AccountSection
      title={m.account.sessionsSection.title}
      subtitle={m.account.sessionsSection.description}
      notice={message !== null ? <Alert variant="danger">{message}</Alert> : undefined}
    >
      <AccountRow
        glyph={<LogOut className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.signOut.title}
        detail={m.account.signOut.description}
      >
        <SignOutButton signOut={signOut} />
      </AccountRow>
      <AccountRow
        glyph={<MonitorSmartphone className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.sessions.title}
        detail={m.account.sessions.description}
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" loading={pending}>{m.account.sessions.title}</Button>
          </DialogTrigger>
          <DialogContent
            title={m.account.sessions.confirmTitle}
            description={m.account.sessions.confirmHint}
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="default">{m.link.methods.cancel}</Button>
                </DialogClose>
                {/*
                  ⚠️ **제출 지점이 Dialog 안이다.** 실패 Alert는 구역에 남으므로 Dialog가 닫힌 뒤에도
                  사유가 보인다. ⚠️ `DialogClose`로 감싸지 않는다 — 이 버튼은 닫는 것이 아니라
                  provider로 나간다.
                */}
                <form action={submit}>
                  <Button type="submit" variant="danger">
                    {confirmProvider === null ? m.account.sessions.button : m.account.sessions.confirmAction(confirmProvider)}
                  </Button>
                </form>
              </>
            }
          />
        </Dialog>
      </AccountRow>
    </AccountSection>
  );
}

/**
 * ⚠️ **확정이 `primary`인 유일한 자리다** — 넷 중 이것만 잃는 것이 없다(재로그인 한 번이다).
 * 넷을 다 붉게 칠하면 같은 무게로 보인다.
 */
function SignOutButton({ signOut }: { signOut: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">{m.common.nav.signOut}</Button>
      </DialogTrigger>
      <DialogContent
        title={m.account.signOut.confirmTitle}
        description={m.account.signOut.confirmHint}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="default">{m.link.methods.cancel}</Button>
            </DialogClose>
            <form action={signOut}>
              <SubmitSignOut />
            </form>
          </>
        }
      />
    </Dialog>
  );
}

function SubmitSignOut() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {m.common.nav.signOut}
    </Button>
  );
}
