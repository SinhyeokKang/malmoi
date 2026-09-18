"use client";

import { MailPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { revokeInvitation } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

/**
 * 대기 중인 초대 (DESIGN §6.65).
 *
 * ⚠️ **[Revoke]는 삭제가 아니라 만료다** — 그 판정은 서버에 있고(`revokeInvitation`), 여기서 알 것은
 * "성공하면 이 행이 목록에서 빠진다"뿐이다. `revalidatePath`가 다시 그린다.
 *
 * ⚠️ **0건 빈 상태가 있다** — 표 머리만 남은 화면은 "불러오는 중"과 구별되지 않는다.
 */
export function PendingInvitations({
  slug,
  invitations,
  role,
  now,
  headingId,
}: {
  slug: string;
  /**
   * ⚠️ **행이 라벨을 들고 온다** (2026-09-09, sec-audit 발견 4 — 전엔 `labels` prop이었다).
   * 라벨은 서버가 **목록 전체를 보고** 만든다: 행마다 따로 마스킹하면 서로 다른 주소가 같은 행이
   * 되고 [Revoke]가 엉뚱한 링크를 지운다 (malmoi#18). 원문은 이제 여기 오지 않는다.
   */
  invitations: readonly PendingInvitation[];
  role: Role;
  now: Date;
  /** 철회 뒤 포커스 착지점 — `MemberList`와 같은 이유이고, 마지막 초대를 지워 빈 상태로 접혀도 남는다 (malmoi#51). */
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
    {/* ⚠️ **빈 상태 갈래 밖에 둔다** — 마지막 초대를 지우면 표가 `EmptyState`로 접히는데, 그때 live 영역이
        같이 사라지면 알림이 읽히지 않는다. */}
    <p role="status" className="sr-only">{announcement}</p>
    {invitations.length === 0 ? (
      <EmptyState
        icon={MailPlus}
        title={m.members.pending.empty.title}
        description={m.members.pending.empty.description}
      />
    ) : (
    <Table>
      <thead>
        <tr>
          <Th>{m.members.pending.columns.email}</Th>
          <Th>{m.members.pending.columns.role}</Th>
          <Th>{m.members.pending.columns.expires}</Th>
          <Th>{m.members.pending.columns.invitedBy}</Th>
          <Th className="text-right">
            <span className="sr-only">{m.members.columns.actions}</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {invitations.map((invitation) => (
          <tr key={invitation.id}>
            {/* 라벨은 서버가 목록 전체를 보고 만든다 — 원문은 여기 오지 않는다 (sec-audit 발견 4). */}
            {/* ⚠️ 주소는 sans다 (2026-09-13) — `member-list.tsx`와 같은 자리다. */}
            <Td>{invitation.emailLabel}</Td>
            <Td>{m.projects.role[invitation.role]}</Td>
            <Td className="text-muted-foreground text-xs">{relativeTime(invitation.expiresAt, now)}</Td>
            <Td className="text-muted-foreground text-xs">
              {invitation.invitedByName ?? m.members.pending.unknownInviter}
            </Td>
            <Td className="text-right">
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
              {failed?.id === invitation.id && (
                <Alert variant="danger" className="mt-2 text-left">
                  {isAccessError(failed.error)
                    ? accessErrorMessage(failed.error)
                    : m.members.pending.revokeFailed(failed.error)}
                </Alert>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
    )}
    </>
  );
}
