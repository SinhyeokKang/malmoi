"use client";

import { Mail, MailPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { resendInvitation, revokeInvitation, type ResendResult } from "@/app/(edit)/projects/actions";
import { MemberRow } from "@/components/members/member-row";
import { RoleChip } from "@/components/members/role-chip";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyRowCard, RowCard, RowCardItem, RowCardList } from "@/components/ui/row-card";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform, type Role } from "@/lib/auth/permission";
import { planMemberIdentity } from "@/lib/auth/member-identity";
import type { PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";
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
  /** `error: null`은 **확인 불가**다 — 호출이 던져 서버가 철회했는지 모른다 (audit #24). */
  const [failed, setFailed] = useState<{ id: string; error: string | null } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** ⚠️ **집합이다** — 값 하나면 두 행을 연달아 누를 때 먼저 끝난 응답이 다른 행의 잠금까지 푼다. */
  const [resending, setResending] = useState<ReadonlySet<string>>(new Set());
  const [cardAlert, setCardAlert] = useState<{ variant: "warning" | "danger"; text: string } | null>(null);
  /** Resend 뒤 포커스 착지점 — 행이 남으면 그 버튼, 교체되면 카드 제목. 잠금이 풀린 커밋에서 옮긴다. */
  const [landing, setLanding] = useState<{ kind: "resend"; id: string } | { kind: "heading" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();

  /**
   * ⚠️ **거부되면 누른 Revoke로 포커스를 돌려준다** (malmoi#53). 그때 그 버튼은 `loading` 동안 `disabled`라
   * 브라우저가 포커스를 `body`로 떨어뜨렸다. 2026-09-24(audit #32b)부터 `busy`라 포커스를 지키므로 이 effect는
   * 그 사이 옮겨진 포커스의 복귀다 — 커밋 뒤인 effect에서 부르는 이유(`resending`의 `disabled`)는 그대로다.
   */
  useEffect(() => {
    if (failed !== null) document.getElementById(`revoke-${failed.id}`)?.focus();
  }, [failed]);

  useEffect(() => {
    if (landing === null || (landing.kind === "resend" && resending.has(landing.id))) return;
    const button = landing.kind === "resend" ? (document.getElementById(`resend-${landing.id}`) as HTMLButtonElement | null) : null;
    if (button !== null && !button.disabled) button.focus();
    else document.getElementById(headingId)?.focus();
    setLanding(null);
  }, [landing, resending, headingId]);

  function resend(invitationId: string, who: string) {
    setFailed(null);
    setCardAlert(null);
    setAnnouncement("");
    setResending((current) => new Set(current).add(invitationId));
    startTransition(async () => {
      let result: ResendResult | null;
      try {
        result = await resendInvitation({ slug, invitationId });
      } catch {
        // 호출이 끊기면 서버가 재발급했는지 모른다 — 미확인으로 말한다.
        result = null;
      }
      setResending((current) => {
        const next = new Set(current);
        next.delete(invitationId);
        return next;
      });
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
      // ⚠️ 던져도 행을 풀고 그 자리에서 말한다 (audit #24) — 위 `resend`와 같은 형이다.
      let result: Awaited<ReturnType<typeof revokeInvitation>> | null;
      try { result = await revokeInvitation({ slug, invitationId }); } catch { result = null; }
      setPendingId(null);
      if (result === null || !result.ok) {
        setFailed({ id: invitationId, error: result === null ? null : result.error });
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
                        {/* ⚠️ 잘리는 유일한 가변 칸이라 전문을 `title`로 든다 (malmoi#90) — 1280에서 112px라 12자 이름부터 잘리고,
                            초대한 사람을 말하는 자리가 이 칸뿐이다. 보이는 문장이 곧 접근 이름이라 스크린리더는 원래 전문을 읽는다. */}
                        <span className="text-muted-foreground min-w-0 truncate text-xs" title={m.members.pending.invitedBy(invitation.invitedByName ?? m.members.pending.unknownInviter)}>
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
                              aria-busy={resending.has(invitation.id)}
                              loading={resending.has(invitation.id)}
                              disabled={pendingId === invitation.id}
                              onClick={() => resend(invitation.id, invitation.emailLabel)}
                            >
                              {m.members.pending.resend}
                            </Button>
                            {/* 확인을 한 번 받는다 (audit #20) — 링크가 즉시 죽고 되돌릴 수 없다. 같은 화면의 Remove와 같은 형이다. */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  id={`revoke-${invitation.id}`}
                                  variant="danger"
                                  aria-label={m.members.pending.revokeLabel(invitation.emailLabel)}
                                  /* ⚠️ `loading`이 아니라 `busy`다 (audit #32b) — 확정하면 Dialog가 이 트리거로 포커스를 돌려주는데, 같은
                                     커밋에 진짜 `disabled`가 되면 그 포커스가 `body`로 빠졌다(`button.tsx`의 `busy`). */
                                  busy={pendingId === invitation.id}
                                  disabled={resending.has(invitation.id)}
                                >
                                  {m.members.pending.revoke}
                                </Button>
                              </DialogTrigger>
                              <DialogContent
                                title={m.members.pending.confirmRevoke(invitation.emailLabel)}
                                description={m.members.pending.confirmRevokeHint}
                                footer={
                                  <>
                                    <DialogClose asChild>
                                      <Button variant="default">{m.members.cancel}</Button>
                                    </DialogClose>
                                    <DialogClose asChild>
                                      <Button variant="danger" onClick={() => revoke(invitation.id, invitation.emailLabel)}>
                                        {m.members.pending.confirmRevokeAction}
                                      </Button>
                                    </DialogClose>
                                  </>
                                }
                              />
                            </Dialog>
                          </>
                        )}
                      </>
                    )}
                    after={
                      failed?.id === invitation.id ? (
                        <Alert variant="danger" className="mx-4 mb-3.5 text-left">
                          {failed.error === null
                            ? m.members.pending.revokeUnconfirmed
                            // ⚠️ `not-found`를 access 문장으로 보내지 않는다 (audit #22) — 그 문장은 초대받은 사람에게 하는 말이다.
                            : failed.error === "not-found"
                              ? m.members.pending.gone(invitation.emailLabel)
                              : isAccessError(failed.error)
                                ? accessErrorMessage(failed.error)
                                : m.members.pending.revokeFailed}
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
    return { variant: "warning", text: result.limit === "project" ? p.resendProjectLimited(who, INVITATION_HOURLY_LIMIT, time) : p.resendLimited(who, time) };
  }
  if (result.error === "email-rejected" && "retryAt" in result) return { variant: "danger", text: p.resendFailed(who, retryAtLabel(result.retryAt)) };
  if (result.error === "email-unavailable") return { variant: "danger", text: p.resendUnavailable(who) };
  if (result.error === "not-found") return { variant: "danger", text: p.gone(who) };
  if (result.error === "already-member") return { variant: "danger", text: m.members.invite.alreadyMember };
  if (isAccessError(result.error)) return { variant: "danger", text: accessErrorMessage(result.error) };
  // ⚠️ 코드 원문을 문장에 끼우지 않는다 (audit #21).
  return { variant: "danger", text: p.resendError(who) };
}
