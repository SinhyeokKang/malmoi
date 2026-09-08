"use client";

import { MailPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { revokeInvitation } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { maskEmail } from "@/lib/auth/email";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

/**
 * 대기 중인 초대 (design §3.9).
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
}: {
  slug: string;
  invitations: readonly PendingInvitation[];
  role: Role;
  now: Date;
}) {
  const manage = canPerform(role, "member:manage");
  const [failed, setFailed] = useState<{ id: string; error: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invitations.length === 0) {
    return (
      <EmptyState
        icon={MailPlus}
        title={m.members.pending.empty.title}
        description={m.members.pending.empty.description}
      />
    );
  }

  function revoke(invitationId: string) {
    setFailed(null);
    setPendingId(invitationId);
    startTransition(async () => {
      const result = await revokeInvitation({ slug, invitationId });
      setPendingId(null);
      if (!result.ok) setFailed({ id: invitationId, error: result.error });
    });
  }

  return (
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
            <Td className="text-mono">{maskEmail(invitation.email)}</Td>
            <Td>{m.projects.role[invitation.role]}</Td>
            <Td className="text-muted-foreground text-xs">{relativeTime(invitation.expiresAt, now)}</Td>
            <Td className="text-muted-foreground text-xs">
              {invitation.invitedByName ?? m.members.pending.unknownInviter}
            </Td>
            <Td className="text-right">
              {manage && (
                <Button
                  variant="ghost"
                  aria-label={m.members.pending.revokeLabel(maskEmail(invitation.email))}
                  loading={pendingId === invitation.id}
                  loadingLabel={m.members.pending.revoking}
                  onClick={() => revoke(invitation.id)}
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
  );
}
