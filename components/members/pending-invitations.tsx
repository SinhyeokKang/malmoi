"use client";

import { Mail, MailPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { resendInvitation, revokeInvitation, type ResendResult } from "@/app/(edit)/projects/actions";
import { MemberRow } from "@/components/members/member-row";
import { RoleChip } from "@/components/members/role-chip";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyRowCard, RowCard, RowCardItem, RowCardList } from "@/components/ui/row-card";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform, type Role } from "@/lib/auth/permission";
import { planMemberIdentity } from "@/lib/auth/member-identity";
import type { PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { retryAtLabel } from "@/lib/invitation-email/retry-at";
import { relativeTime } from "@/lib/relative-time";

/**
 * 대기 중인 초대 (DESIGN §6.65). **멤버 카드와 같은 그릇·같은 행 껍데기다.**
 *
 * ⚠️ **역할이 전원 자물쇠 칩이다** — 발급된 초대의 역할은 바꿀 수 없다(고치려면 철회 후 재발급).
 * 형이 그 사실을 말하므로 OWNER에게도 셀렉트를 그리지 않는다.
 *
 * ⚠️ **[Revoke]는 삭제가 아니라 만료다** — 그 판정은 서버에 있고(`revokeInvitation`), 여기서 알 것은
 * "성공하면 이 행이 목록에서 빠진다"뿐이다. `revalidatePath`가 다시 그린다.
 *
 * ⚠️ **마스킹 라벨이 유일한 식별자다** (malmoi#18). 이름도 아바타도 없으므로 행을 가르는 것은 그
 * 라벨뿐이고, 그것은 서버가 **목록 전체를 보고** 만든다 — 행마다 따로 마스킹하면 서로 다른 주소가
 * 같은 행이 되고 되돌릴 수 없는 [Revoke]가 엉뚱한 링크를 지운다.
 *
 * ⚠️ **[Resend]의 결과는 행이 아니라 카드에 붙는다** (핸드오프 `1l`). Resend는 서버가 새 초대로 행을 바꾸고
 * 목록을 다시 그리므로, 행에 매단 안내는 행과 함께 사라진다 — 그래서 카드 머리 아래 Alert 하나이고 대상
 * 라벨을 문장에 넣는다. 성공은 토스트다. 라벨은 **누른 행의 것**이다(목록 전체를 보고 만든 값이라 화면과 같다).
 */
export function PendingInvitations({
  slug,
  invitations,
  role,
  now,
  headingId,
}: {
  slug: string;
  invitations: readonly PendingInvitation[];
  role: Role;
  now: Date;
  /** 철회 뒤 포커스 착지점 — 이 카드의 제목이고, 마지막 초대를 지워 빈 상태로 접혀도 남는다 (malmoi#51). */
  headingId: string;
}) {
  const manage = canPerform(role, "member:manage");
  const [failed, setFailed] = useState<{ id: string; error: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cardAlert, setCardAlert] = useState<{ variant: "warning" | "danger"; text: string } | null>(null);
  /** Resend 뒤 포커스 착지점 — 행이 남으면 그 버튼, 교체되면 카드 제목. 잠금이 풀린 커밋에서 옮긴다. */
  const [landing, setLanding] = useState<{ kind: "resend"; id: string } | { kind: "heading" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();

  /**
   * ⚠️ **거부되면 누른 Revoke로 포커스를 돌려준다** (malmoi#53). 그 버튼은 `loading` 동안 `disabled`라
   * 브라우저가 포커스를 `body`로 떨어뜨리고, 행 옆 Alert를 찾으려면 맨 위부터 다시 탭해야 했다.
   * 응답 콜백에서 바로 부르지 않는 이유: 그 시점엔 `pendingId`가 아직 커밋 전이라 버튼이 여전히
   * `disabled`고 `focus()`가 무시된다 — 커밋 뒤인 effect에서 부른다.
   */
  useEffect(() => {
    if (failed !== null) document.getElementById(`revoke-${failed.id}`)?.focus();
  }, [failed]);

  useEffect(() => {
    if (landing === null || resendingId !== null) return;
    const button = landing.kind === "resend" ? (document.getElementById(`resend-${landing.id}`) as HTMLButtonElement | null) : null;
    if (button !== null && !button.disabled) button.focus();
    else document.getElementById(headingId)?.focus();
    setLanding(null);
  }, [landing, resendingId, headingId]);

  function resend(invitationId: string, who: string) {
    setFailed(null);
    setCardAlert(null);
    setAnnouncement("");
    setResendingId(invitationId);
    startTransition(async () => {
      let result: ResendResult | null;
      try {
        result = await resendInvitation({ slug, invitationId });
      } catch {
        // 호출이 끊기면 서버가 재발급했는지 모른다 — 미확인으로 말한다.
        result = null;
      }
      setResendingId(null);
      if (result !== null && result.ok) {
        toast.success(m.members.pending.resentToast(who));
        setLanding({ kind: "heading" });
        return;
      }
      setCardAlert(resendAlert(result, who));
      // 발급 뒤 메일 단계의 실패면 행이 이미 새 초대로 바뀌었다 — 성공 여부가 아니라 행이 남는지로 고른다.
      const replaced = result === null || result.error === "email-rejected" || result.error === "email-unknown";
      setLanding(replaced ? { kind: "heading" } : { kind: "resend", id: invitationId });
    });
  }

  function revoke(invitationId: string, who: string) {
    setFailed(null);
    setCardAlert(null);
    setAnnouncement("");
    setPendingId(invitationId);
    startTransition(async () => {
      const result = await revokeInvitation({ slug, invitationId });
      setPendingId(null);
      if (!result.ok) {
        setFailed({ id: invitationId, error: result.error });
        return;
      }
      document.getElementById(headingId)?.focus();
      setAnnouncement(m.members.pending.revoked(who));
    });
  }

  return (
    <>
      {/* ⚠️ **빈 상태 갈래 밖에 둔다** — 마지막 초대를 지우면 카드가 빈 상태로 접히는데, 그때 live 영역이
          같이 사라지면 알림이 읽히지 않는다. */}
      <p role="status" className="sr-only">{announcement}</p>
      <RowCard
        title={m.members.pending.title}
        titleId={headingId}
        count={invitations.length}
        countLabel={m.members.pending.count(invitations.length)}
        description={m.members.pending.cardHint}
      >
        {cardAlert !== null && (
          <div data-pending-alert>
            <Alert inset variant={cardAlert.variant} onDismiss={() => setCardAlert(null)}>
              {cardAlert.text}
            </Alert>
          </div>
        )}
        {invitations.length === 0 ? (
          /* ⚠️ **버튼이 없다** — 여기서 할 일은 헤더의 [Invite]이고, 카드가 그것을 두 번 말하지 않는다. */
          <EmptyRowCard
            icon={MailPlus}
            title={m.members.pending.empty.title}
            description={m.members.pending.empty.description}
            inset
          />
        ) : (
          <RowCardList labelledBy={headingId}>
            {invitations.map((invitation, index) => {
              /* ⚠️ **`name: null`을 박는다** — `PendingInvitation`에는 이름이 없다(`invitedByName`은
                 초대한 **다른** 사람이다). 그래서 마스킹 라벨이 1행으로 올라가고 아바타는 중립 원이다. */
              const identity = planMemberIdentity({
                name: null,
                emailLabel: invitation.emailLabel,
                readable: invitation.readable,
              });
              return (
                <RowCardItem key={invitation.id} first={index === 0}>
                  <MemberRow
                    id={invitation.id}
                    identity={identity}
                    /*
                      ⚠️ **아바타가 아니라 mail 칩이다** (캔버스 `1a`). 아직 사람이 아니라 **보낸 링크**이고,
                      이니셜 원을 그리면 멤버 카드의 행과 구별되지 않는다. 씨앗도 없다(이름이 없는 행이라
                      `planMemberIdentity`가 `avatarSeed: null`을 준다).
                    */
                    glyph={
                      <span
                        aria-hidden
                        className="bg-foreground/[0.05] text-muted-foreground flex size-8 items-center justify-center rounded-full"
                      >
                        <Mail className="size-3.5" />
                      </span>
                    }
                    meta={
                      /* ⚠️ **가로 두 칸이다** (캔버스) — 만료는 150 고정, 초대한 사람은 남는 폭이다.
                         세로로 쌓으면 행 높이가 멤버 카드와 달라져 두 카드가 다른 표처럼 읽힌다. */
                      <>
                        <span className="text-muted-foreground w-[150px] shrink-0 text-xs">
                          {m.members.pending.expires(relativeTime(invitation.expiresAt, now))}
                        </span>
                        <span className="text-muted-foreground min-w-0 truncate text-xs">
                          {m.members.pending.invitedBy(invitation.invitedByName ?? m.members.pending.unknownInviter)}
                        </span>
                      </>
                    }
                    band={invitation.readable ? null : m.members.unreadableHint}
                    controls={() => (
                      <>
                        <RoleChip role={invitation.role} reason="pending" />
                        {manage && (
                          <>
                            {/* ⚠️ 처리 중엔 **그 행의** 두 버튼만 잠근다 — 다른 행은 계속 누를 수 있다. */}
                            <Button
                              id={`resend-${invitation.id}`}
                              data-resend
                              aria-label={m.members.pending.resendLabel(invitation.emailLabel)}
                              aria-busy={resendingId === invitation.id}
                              loading={resendingId === invitation.id}
                              disabled={pendingId === invitation.id}
                              onClick={() => resend(invitation.id, invitation.emailLabel)}
                            >
                              {m.members.pending.resend}
                            </Button>
                            <Button
                              id={`revoke-${invitation.id}`}
                              variant="danger"
                              aria-label={m.members.pending.revokeLabel(invitation.emailLabel)}
                              loading={pendingId === invitation.id}
                              disabled={resendingId === invitation.id}
                              onClick={() => revoke(invitation.id, invitation.emailLabel)}
                            >
                              {m.members.pending.revoke}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                    after={
                      failed?.id === invitation.id ? (
                        <Alert variant="danger" className="mx-4 mb-3.5 text-left">
                          {isAccessError(failed.error)
                            ? accessErrorMessage(failed.error)
                            : m.members.pending.revokeFailed(failed.error)}
                        </Alert>
                      ) : null
                    }
                  />
                </RowCardItem>
              );
            })}
          </RowCardList>
        )}
      </RowCard>
    </>
  );
}

/** Resend 거부 → 카드 Alert 한 장. `null`은 호출 자체가 끊긴 경우다(결과 미확인). */
function resendAlert(result: Exclude<ResendResult, { ok: true }> | null, who: string): { variant: "warning" | "danger"; text: string } {
  const p = m.members.pending;
  if (result === null || result.error === "email-unknown") return { variant: "warning", text: p.resendUnconfirmed(who) };
  if (result.error === "rate-limited" && "limit" in result) {
    const time = retryAtLabel(result.retryAt);
    return { variant: "warning", text: result.limit === "project" ? p.resendProjectLimited(who, time) : p.resendLimited(who, time) };
  }
  if (result.error === "email-rejected" && "retryAt" in result) return { variant: "danger", text: p.resendFailed(who, retryAtLabel(result.retryAt)) };
  if (result.error === "email-unavailable") return { variant: "danger", text: p.resendUnavailable(who) };
  if (result.error === "not-found") return { variant: "danger", text: p.resendGone(who) };
  if (result.error === "already-member") return { variant: "danger", text: p.resendError(who, m.members.invite.alreadyMember) };
  if (isAccessError(result.error)) return { variant: "danger", text: accessErrorMessage(result.error) };
  return { variant: "danger", text: p.resendError(who, result.error) };
}
