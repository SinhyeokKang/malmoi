"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { startTransition, useActionState } from "react";
import { useFormStatus } from "react-dom";

import { startSessionRevocation } from "@/app/(edit)/account/actions";
import { PanelCard, PanelRow, PanelRows } from "@/components/ui/panel-card";
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
   * ⚠️ **성공하면 여기서 돌아오지 않는다** — Action이 provider로 `redirect`한다. 그래서 **다음 줄에 도달했다는 것 자체가
   * 실패**다. Dialog는 확정과 함께 이미 닫혀 있어(절차 (a)) 사유가 구역 Alert에 그대로 보인다.
   */
  const [failed, submit, pending] = useActionState(async () => {
    // ⚠️ 던지면 `useActionState`가 error boundary로 올린다 (audit-ux #14) — 통신 실패도 실패다. provider로 가는 redirect만 되던진다.
    try { await startSessionRevocation(); } catch (thrown) { unstable_rethrow(thrown); }
    return true;
  }, false);
  // 제출 실패는 `?sessionRevocation=invalid`·`=unavailable`과 같은 문구로 접힌다 — 할 일이 같다.
  const message = failed ? m.account.sessions.failed : sessionRevocationMessage(outcome);

  return (
    <PanelCard
      title={m.account.sessionsSection.title}
      notice={message !== null ? <Alert inset variant="danger">{message}</Alert> : undefined}
    >
      <PanelRows>
      <PanelRow
        icon={<LogOut className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.signOut.title}
        description={m.account.signOut.description}
        actions={<SignOutButton signOut={signOut} />}
      />
      <PanelRow
        icon={<MonitorSmartphone className="text-muted-foreground size-4" aria-hidden />}
        name={m.account.sessions.title}
        /**
         * ⚠️ **확인이 둘이 된다는 사실을 누르기 전에 말한다** — 이 왕복은 provider 화면을 한 번 더
         * 지나고, 예고가 없으면 그 두 번째가 실패로 읽힌다.
         *
         * ⚠️ **provider 이름이 없는 문구다.** `confirmDetail(provider)`를 쓰면 확인 상대를 못 고르는
         * 갈래에서 이 줄만 사라져 **위 행과 높이가 갈린다** — 수단 카드에서 보조 줄 둘을 다 지운 것과
         * 같은 논거를 여기서 반대로 적용하지 않는다. provider 이름은 Dialog의 검은 줄이 든다.
         */
        description={m.account.sessions.willConfirm}
        actions={
          <Dialog>
            <DialogTrigger asChild>
              {/*
                ⚠️ **넷 중 이것만 행에서도 붉다** — 되돌리려면 모든 기기에서 다시 로그인해야 하고,
                바로 위의 [Sign out]과 **같은 리스트의 이웃**이라 무게 차이를 그 자리에서 말해야 한다.
                ⚠️ **`disabled`가 아니라 `busy`다** (ux-drift-unify 3-⚪17 · 절차 (a)) — 확정하면 Dialog가 닫히며 이 트리거로 포커스를
                돌려주는데, 진짜 `disabled`면 그 포커스가 `body`로 빠진다. **두 번째 challenge도 여기서 막힌다** — `busy`는 클릭을
                삼켜 Action이 redirect하기 전에 Dialog를 다시 열 수 없다. 두 번째 `beginRevocation`은 첫 challenge를 지우므로
                돌아온 첫 callback이 `?sessionRevocation=invalid`가 된다(그래서 옛 판은 Dialog를 연 채 확정에 `loading`을 걸었다).
              */}
              <Button variant="danger" busy={pending}>{m.account.sessions.title}</Button>
            </DialogTrigger>
            <DialogContent
              title={m.account.sessions.confirmTitle}
              description={m.account.sessions.confirmHint}
              actions={
                <>
                  <DialogClose asChild>
                    <Button data-initial-focus variant="default">{m.common.cancel}</Button>
                  </DialogClose>
                  {/* 실패 Alert는 구역에 선다 — Dialog가 닫힌 뒤에도 사유가 보인다(절차 (a), DESIGN §6.4). */}
                  <DialogClose asChild>
                    <Button variant="danger" onClick={() => startTransition(submit)}>
                      {confirmProvider === null ? m.account.sessions.button : m.account.sessions.confirmAction(confirmProvider)}
                    </Button>
                  </DialogClose>
                </>
              }
            >
              {/* 검은 줄 — *지금 참인 값*이다. 확인 상대를 모르면 그리지 않는다(없으면 안 그린다). */}
              {confirmProvider !== null && m.account.sessions.confirmDetail(confirmProvider)}
            </DialogContent>
          </Dialog>
        }
      />
      </PanelRows>
    </PanelCard>
  );
}

/**
 * ⚠️ **확인이 없다** (ux-drift-unify Q4 — DESIGN §6.67) — 잃는 것이 재로그인 한 번이고(미전달 편집은 서버에 남는다), 셸 메뉴의
 * 로그아웃이 이미 확인 없이 제출한다. 같은 동작이 자리마다 한 번은 묻고 한 번은 안 물었다.
 */
function SignOutButton({ signOut }: { signOut: () => void }) {
  return (
    <form action={signOut}>
      <SubmitSignOut />
    </form>
  );
}

function SubmitSignOut() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="default" loading={pending}>
      {m.common.nav.signOut}
    </Button>
  );
}
