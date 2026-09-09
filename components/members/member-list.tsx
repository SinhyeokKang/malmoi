"use client";

import { useState, useTransition } from "react";

import { changeMember } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { MemberView } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

/**
 * 멤버 표 (design §3.9 · user-stories §5).
 *
 * ⚠️ **EDITOR도 이 표를 본다** — 컨트롤만 `canPerform`으로 감춘다. 감추는 것은 **편의이고 차단이
 * 아니다**: 방어는 `changeMember`의 `member:manage`이고, 그래도 감추는 이유는 EDITOR에게 셀렉트를
 * 그리면 눌렀을 때만 거부되어 "왜 안 되지"가 되기 때문이다.
 *
 * ⚠️ **이메일은 전원에게 마스킹한다** — 규칙을 역할로 나누지 않는다(OWNER도 같다). 되돌릴 수 없는
 * 변환이라 **대조에 쓰지 않는다**: 초대 중복 판정은 서버가 원문으로 한다 (`lib/auth/email.ts`).
 *
 * ⚠️ **거부 문구는 행 옆 인라인이다.** 마지막 OWNER 보호(`last-owner`)는 그 행에 대한 판정이므로,
 * 페이지 상단 global Alert로 올리면 어느 행이 거부됐는지 사라진다 (DESIGN §6.4).
 */
export function MemberList({
  slug,
  members,
  role,
  viewerId,
  now,
}: {
  slug: string;
  members: readonly MemberView[];
  role: Role;
  viewerId: string;
  /** 서버가 넘긴 기준 시각. 클라이언트에서 `new Date()`를 부르면 hydration이 갈린다. */
  now: Date;
}) {
  const manage = canPerform(role, "member:manage");
  const [failed, setFailed] = useState<{ userId: string; error: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function apply(targetUserId: string, nextRole: Role | null) {
    setFailed(null);
    setPendingId(targetUserId);
    startTransition(async () => {
      const result = await changeMember({ slug, targetUserId, nextRole });
      setPendingId(null);
      if (!result.ok) setFailed({ userId: targetUserId, error: result.error });
    });
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>{m.members.columns.person}</Th>
          <Th>{m.members.columns.email}</Th>
          <Th>{m.members.columns.role}</Th>
          <Th>{m.members.columns.joined}</Th>
          {/* 시각적으로는 빈 열이지만 이름 없는 `<th>`를 남기지 않는다 (DESIGN §7 · 🟡3). */}
          <Th className="text-right">
            <span className="sr-only">{m.members.columns.actions}</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => {
          // 라벨이 대상을 들어야 한다 — 행마다 같은 문구면 어느 사람의 컨트롤인지 구별되지 않는다.
          // ⚠️ **라벨은 서버가 만든다** (sec-audit 발견 4) — 여기서 가리면 원문이 이미 페이로드에 있다.
          const who = member.name ?? member.emailLabel ?? m.members.unnamed;
          return (
          <tr key={member.userId}>
            <Td>
              {member.name ?? <span className="text-muted-foreground">{m.members.unnamed}</span>}
              {member.userId === viewerId && (
                <span className="text-muted-foreground ml-2 text-xs">({m.members.you})</span>
              )}
            </Td>
            {/* 주소는 식별자라 mono다 (DESIGN §4.1) — 한 줄이므로 개행 보존이 필요 없다. */}
            <Td className="text-mono">{member.emailLabel ?? "—"}</Td>
            <Td>
              {manage ? (
                <Select
                  aria-label={m.members.changeRole(who)}
                  value={member.role}
                  disabled={pendingId === member.userId}
                  onChange={(e) => apply(member.userId, e.target.value as Role)}
                >
                  <option value="OWNER">{m.projects.role.OWNER}</option>
                  <option value="EDITOR">{m.projects.role.EDITOR}</option>
                </Select>
              ) : (
                m.projects.role[member.role]
              )}
            </Td>
            <Td className="text-muted-foreground text-xs">{relativeTime(member.joinedAt, now)}</Td>
            <Td className="text-right">
              {manage && (
                <RemoveButton
                  who={who}
                  pending={pendingId === member.userId}
                  onConfirm={() => apply(member.userId, null)}
                />
              )}
              {failed?.userId === member.userId && (
                <Alert variant="danger" className="mt-2 text-left">
                  {isAccessError(failed.error)
                    ? accessErrorMessage(failed.error)
                    : m.members.changeFailed(failed.error)}
                </Alert>
              )}
            </Td>
          </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** 제거는 되돌릴 수 없어 확인을 한 번 받는다 (DESIGN §6.4 — 제목은 대상을 명시한 질문). */
function RemoveButton({
  who,
  pending,
  onConfirm,
}: {
  who: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* ⚠️ `aria-label`이 보이는 텍스트("Remove")를 **포함**한다 — 음성 입력이 라벨로 컨트롤을
            찾으므로 다른 문구로 바꾸면 "Remove 클릭"이 안 먹는다 (WCAG 2.5.3). */}
        <Button
          variant="ghost"
          aria-label={m.members.removeLabel(who)}
          loading={pending}
          loadingLabel={m.members.removing}
        >
          {m.members.remove}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={m.members.confirmRemove(who)}
        description={m.members.confirmRemoveHint}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="default">{m.members.cancel}</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" onClick={onConfirm}>
                {m.members.remove}
              </Button>
            </DialogClose>
          </>
        }
      />
    </Dialog>
  );
}
