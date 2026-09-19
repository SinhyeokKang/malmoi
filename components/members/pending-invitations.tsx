"use client";

import { Mail } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { revokeInvitation } from "@/app/(edit)/projects/actions";
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

  function revoke(invitationId: string, who: string) {
    setFailed(null);
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
        {invitations.length === 0 ? (
          /* ⚠️ **버튼이 없다** — 여기서 할 일은 헤더의 [Invite]이고, 카드가 그것을 두 번 말하지 않는다. */
          <EmptyRowCard
            icon={Mail}
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
                    meta={
                      <span className="text-muted-foreground flex shrink-0 flex-col items-end gap-0.5 text-xs">
                        <span>{relativeTime(invitation.expiresAt, now)}</span>
                        <span>
                          {m.members.pending.invitedBy(invitation.invitedByName ?? m.members.pending.unknownInviter)}
                        </span>
                      </span>
                    }
                    band={invitation.readable ? null : m.members.unreadableHint}
                    controls={() => (
                      <>
                        <RoleChip role={invitation.role} who={invitation.emailLabel} />
                        {manage && (
                          <Button
                            id={`revoke-${invitation.id}`}
                            variant="ghost"
                            aria-label={m.members.pending.revokeLabel(invitation.emailLabel)}
                            loading={pendingId === invitation.id}
                            onClick={() => revoke(invitation.id, invitation.emailLabel)}
                          >
                            {m.members.pending.revoke}
                          </Button>
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
