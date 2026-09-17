"use client";

import { useEffect, useState, useTransition } from "react";

import { changeMember } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  headingId,
}: {
  slug: string;
  members: readonly MemberView[];
  role: Role;
  viewerId: string;
  /** 서버가 넘긴 기준 시각. 클라이언트에서 `new Date()`를 부르면 hydration이 갈린다. */
  now: Date;
  /**
   * 제거 뒤 포커스 착지점 — 서버 페이지가 그리는 표 제목이다 (malmoi#51). 포커스를 쥔 행이 사라지면
   * 브라우저가 `body`로 떨어뜨리고, 이웃 행은 마지막 행을 지우면 없다.
   */
  headingId: string;
}) {
  const manage = canPerform(role, "member:manage");
  /** `removal` — 거부된 것이 제거였나. 포커스를 돌려줄 컨트롤이 그것으로 갈린다. */
  const [failed, setFailed] = useState<{ userId: string; error: string; removal: boolean } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();

  /**
   * ⚠️ **제거가 거부되면 그 행의 Remove로 포커스를 돌려준다** (malmoi#53). Dialog는 닫히면서 트리거로
   * 포커스를 돌려주는데 그 순간 트리거가 `loading` → `disabled`라 받지 못하고 `body`로 빠진다.
   * 응답 콜백에서 바로 부르지 않는 이유: 그 시점엔 `pendingId`가 아직 커밋 전이라 여전히 `disabled`고
   * `focus()`가 무시된다 — 커밋 뒤인 effect에서 부른다.
   */
  useEffect(() => {
    if (failed?.removal) document.getElementById(`remove-${failed.userId}`)?.focus();
  }, [failed]);

  function apply(targetUserId: string, nextRole: Role | null, who: string) {
    setFailed(null);
    setAnnouncement("");
    setPendingId(targetUserId);
    startTransition(async () => {
      const result = await changeMember({ slug, targetUserId, nextRole });
      setPendingId(null);
      if (!result.ok) {
        setFailed({ userId: targetUserId, error: result.error, removal: nextRole === null });
        return;
      }
      // 역할 변경은 행이 남아 포커스가 셀렉트에 그대로 있다 — 옮기는 것은 행이 사라지는 제거뿐이다.
      if (nextRole === null) {
        document.getElementById(headingId)?.focus();
        setAnnouncement(m.members.removed(who));
      }
    });
  }

  return (
    <>
    {/* ⚠️ **결과 전부터 DOM에 있어야 한다** — 텍스트와 함께 새로 붙는 live 영역은 스크린 리더가 놓친다. */}
    <p role="status" className="sr-only">{announcement}</p>
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
            {/* ⚠️ 주소는 sans다 (2026-09-13) — 마스킹된 값이라 더욱 읽는 값이다. */}
            <Td>{member.emailLabel ?? "—"}</Td>
            <Td>
              {manage ? (
                <Select
                  value={member.role}
                  disabled={pendingId === member.userId}
                  onValueChange={(value) => apply(member.userId, value as Role, who)}
                >
                  {/* ⚠️ 라벨이 트리거 **밖**이다 — 안에 두면 자기 참조가 내용으로 풀릴 때 두 번 읽힌다 (리뷰 2026-09-13). */}
                  <span id={`role-${member.userId}-label`} className="sr-only">
                    {m.members.changeRole(who)}
                  </span>
                  <SelectTrigger
                    id={`role-${member.userId}`}
                    aria-labelledby={`role-${member.userId}-label role-${member.userId}`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">{m.projects.role.OWNER}</SelectItem>
                    <SelectItem value="EDITOR">{m.projects.role.EDITOR}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                m.projects.role[member.role]
              )}
            </Td>
            <Td className="text-muted-foreground text-xs">{relativeTime(member.joinedAt, now)}</Td>
            <Td className="text-right">
              {manage && (
                <RemoveButton
                  id={`remove-${member.userId}`}
                  who={who}
                  pending={pendingId === member.userId}
                  onConfirm={() => apply(member.userId, null, who)}
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
    </>
  );
}

/** 제거는 되돌릴 수 없어 확인을 한 번 받는다 (DESIGN §6.4 — 제목은 대상을 명시한 질문). */
function RemoveButton({
  id,
  who,
  pending,
  onConfirm,
}: {
  id: string;
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
          id={id}
          variant="ghost"
          aria-label={m.members.removeLabel(who)}
          loading={pending}
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
