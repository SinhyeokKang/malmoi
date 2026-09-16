"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { startSessionRevocation } from "@/app/(edit)/account/actions";
import { AccountCard, AccountRow, AccountRows } from "@/components/account/account-section";
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
  /**
   * ⚠️ **성공하면 여기서 돌아오지 않는다** — Action이 provider로 `redirect`한다. 그래서 **다음 줄에
   * 도달했다는 것 자체가 실패**이고, 그때 Dialog를 닫아야 구역 Alert가 보인다. 안 닫으면 실패
   * 사유가 자기를 띄운 Dialog 뒤에 가려진다.
   */
  const [open, setOpen] = useState(false);
  const [failed, submit, pending] = useActionState(async () => {
    await startSessionRevocation();
    setOpen(false);
    return true;
  }, false);
  // 제출 실패는 `?sessionRevocation=invalid`·`=unavailable`과 같은 문구로 접힌다 — 할 일이 같다.
  const message = failed ? m.account.sessions.failed : sessionRevocationMessage(outcome);

  return (
    <AccountCard
      title={m.account.sessionsSection.title}
      subtitle={m.account.sessionsSection.description}
      notice={message !== null ? <Alert variant="danger">{message}</Alert> : undefined}
    >
      <AccountRows>
      <AccountRow
        glyph={<LogOut className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.signOut.title}
        status={m.account.signOut.scope}
        detail={m.account.signOut.description}
      >
        <SignOutButton signOut={signOut} />
      </AccountRow>
      <AccountRow
        glyph={<MonitorSmartphone className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.sessions.title}
        status={m.account.sessions.scope}
        /**
         * ⚠️ **확인이 둘이 된다는 사실을 누르기 전에 말한다** — 이 왕복은 provider 화면을 한 번 더
         * 지나고, 예고가 없으면 그 두 번째가 실패로 읽힌다. 확인 상대를 못 고르면 그리지 않는다
         * (없으면 안 그린다 — Dialog의 검은 줄과 같은 규칙).
         */
        detail={confirmProvider === null ? undefined : m.account.sessions.confirmDetail(confirmProvider)}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {/*
              ⚠️ **넷 중 이것만 행에서도 붉다** — 되돌리려면 모든 기기에서 다시 로그인해야 하고,
              바로 위의 [Sign out]과 **같은 리스트의 이웃**이라 무게 차이를 그 자리에서 말해야 한다.
            */}
            <Button variant="danger" disabled={pending}>{m.account.sessions.title}</Button>
          </DialogTrigger>
          <DialogContent
            title={m.account.sessions.confirmTitle}
            description={m.account.sessions.confirmHint}
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="default">{m.common.cancel}</Button>
                </DialogClose>
                {/*
                  ⚠️ **제출 지점이 Dialog 안이다.** 실패 Alert는 구역에 남으므로 Dialog가 닫힌 뒤에도
                  사유가 보인다. ⚠️ `DialogClose`로 감싸지 않는다 — 이 버튼은 닫는 것이 아니라
                  provider로 나간다.
                */}
                <form action={submit}>
                  {/*
                    ⚠️ **`pending`이 이 버튼에 서야 한다** — 트리거는 overlay 뒤에 있어 보이지 않는다.
                    이 Action은 쿠키 정리 → 조회 → `signIn` → challenge 생성을 지난 뒤에야 redirect하고,
                    그동안 화면이 안 바뀌면 사용자가 다시 누른다. 두 번째 `beginRevocation`이 **첫
                    challenge를 지우므로** 돌아온 첫 callback이 `?sessionRevocation=invalid`가 된다.
                  */}
                  <SubmitRevocation label={confirmProvider === null ? m.account.sessions.button : m.account.sessions.confirmAction(confirmProvider)} />
                </form>
              </>
            }
          >
            {/* 검은 줄 — *지금 참인 값*이다. 확인 상대를 모르면 그리지 않는다(없으면 안 그린다). */}
            {confirmProvider !== null && m.account.sessions.confirmDetail(confirmProvider)}
          </DialogContent>
        </Dialog>
      </AccountRow>
      </AccountRows>
    </AccountCard>
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
              <Button variant="default">{m.common.cancel}</Button>
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

function SubmitRevocation({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="danger" loading={pending}>{label}</Button>;
}

function SubmitSignOut() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {m.common.nav.signOut}
    </Button>
  );
}
