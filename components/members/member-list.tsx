"use client";

import { useEffect, useState, useTransition } from "react";

import { changeMember } from "@/app/(edit)/projects/actions";
import { MemberRow } from "@/components/members/member-row";
import { RoleChip } from "@/components/members/role-chip";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { RowCard, RowCardItem, RowCardList } from "@/components/ui/row-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { planMemberIdentity } from "@/lib/auth/member-identity";
import { planMemberChange } from "@/lib/auth/membership";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { MemberView } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

/**
 * 멤버 카드 (DESIGN §6.65).
 *
 * ⚠️ **EDITOR도 이 카드를 본다** — 그리고 **컨트롤이 사라지지 않고 꺼진 채 이유를 든다.** 감추면
 * 오른쪽 끝이 통째로 비어 "여기에 무엇이 있었는지"조차 안 보이고, 같은 화면을 보는 OWNER와 말을
 * 맞출 수 없다. 차단은 여전히 `changeMember`의 `member:manage`이고 노출만 바뀐다.
 *
 * ⚠️ **사전 차단이 서버 거부와 같은 함수를 지난다** — 마지막 오너 판정은 `planMemberChange`이고
 * 문구는 `accessErrorMessage("last-owner")`다. 사전 문구와 사후 Alert이 **같은 문자열**인 것이
 * 배선이 아니라 구조로 보장된다.
 *
 * ⚠️ **이메일은 전원에게 마스킹한다** — 규칙을 역할로 나누지 않는다(OWNER도 같다). 라벨은 서버가
 * 목록 전체를 보고 만든다 (sec-audit 발견 4 · malmoi#18).
 *
 * ⚠️ **거부 문구는 그 행 아래다.** 마지막 OWNER 보호는 그 행에 대한 판정이므로, 페이지 상단 global
 * Alert로 올리면 어느 행이 거부됐는지 사라진다 (DESIGN §6.4).
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
   * 제거 뒤 포커스 착지점 — **이 카드의 제목**이다 (malmoi#51). 포커스를 쥔 행이 사라지면 브라우저가
   * `body`로 떨어뜨리고, 이웃 행은 마지막 행을 지우면 없다. 제목은 카드가 비어도 남는다.
   *
   * ⚠️ **2026-09-19에 페이지에서 카드로 내려왔다** — 카드가 자기 헤더를 들기 때문이다.
   * ⚠️ **페이지 `<h1>Members</h1>` 아래 카드 `<h2>Members</h2>`가 서는 것은 캔버스가 그린 그대로다**
   * (`1a`·`1b` 둘 다 그 형이다). 한때 이 주석이 *"그 중복이 함께 풀렸다"*고 적었는데 **거짓이었다** —
   * 이 배송이 한 일은 착지점을 옮긴 것이고, 제목 텍스트는 원래 캔버스의 결정이다.
   * `<ul aria-labelledby>`도 이 id를 쓴다.
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
      <RowCard
        title={m.common.nav.members}
        titleId={headingId}
        count={members.length}
        countLabel={m.members.count(members.length)}
        description={m.members.cardHint}
      >
        <RowCardList labelledBy={headingId}>
          {members.map((member, index) => {
            const identity = planMemberIdentity(member);
            // 라벨이 대상을 들어야 한다 — 행마다 같은 문구면 어느 사람의 컨트롤인지 구별되지 않는다.
            // ⚠️ **읽기전용 칩만 이 규칙의 예외다** — 포커스를 못 받는 비대화형 요소라 탭으로 도달할 수
            //    없고 낭독이 언제나 그 행의 이름 바로 뒤다(`role-chip.tsx`). 캔버스가 정한 문장에 대상이
            //    없는 이유이고, 그래서 여기서 `who`를 넘기지 않는다.
            // ⚠️ **라벨은 서버가 만든다** (sec-audit 발견 4) — 여기서 가리면 원문이 이미 페이로드에 있다.
            const who = member.name ?? member.emailLabel ?? m.members.unnamed;
            /**
             * ⚠️ **서버(`changeMember`)가 부르는 것과 글자 하나까지 같은 함수다.** 제거(`nextRole: null`)와
             * 강등이 같은 판정을 지나므로 한 번만 불러도 셀렉트와 [Remove] 둘 다 커버된다.
             *
             * ⚠️ **EDITOR에게는 세지 않는다** — 그 사람에게는 어차피 끌 컨트롤이 없고, 사유 띠는
             * **할 수 있는 행동**이 있을 때만 할 일이 있다.
             */
            const blocked =
              manage && planMemberChange({ members, targetUserId: member.userId, nextRole: null }) === "last-owner";
            /**
             * ⚠️ **한 행에 띠는 하나다.** 못 읽음 → 마지막 오너 순으로 문장을 잇는다.
             *
             * ⚠️ **못 읽음은 EDITOR에게도 보인다** — 행이 `Couldn't be read`라고 말하는 이유를 설명하는
             * 문장이지 막힌 행동을 설명하는 문장이 아니다.
             */
            const sentences = [
              member.readable ? null : m.members.unreadableHint,
              blocked ? accessErrorMessage("last-owner") : null,
            ].filter((sentence): sentence is string => sentence !== null);
            const pending = pendingId === member.userId;

            return (
              <RowCardItem key={member.userId} first={index === 0}>
                <MemberRow
                  id={member.userId}
                  identity={identity}
                  you={member.userId === viewerId}
                  meta={
                    /* ⚠️ **150 고정 + 라벨을 든다** (캔버스). 열 머리를 지웠으므로 `2 days ago`가 무엇의
                       시각인지 말하는 자리가 이 문장뿐이고, 폭이 흔들리면 오른쪽 군의 x가 행마다 달라진다. */
                    <span className="text-muted-foreground w-[150px] shrink-0 text-xs">
                      {m.members.joined(relativeTime(member.joinedAt, now))}
                    </span>
                  }
                  band={sentences.length === 0 ? null : sentences.join(" ")}
                  /* 막힌 동작의 사유는 붉게, 못 읽음만이면 조용히 (캔버스 `1c` ↔ `1d`). */
                  bandTone={blocked ? "danger" : "muted"}
                  controls={(describedBy) =>
                    manage ? (
                      <>
                        <RoleSelect
                          member={member}
                          who={who}
                          pending={pending}
                          describedBy={blocked ? describedBy : undefined}
                          onChange={(next) => apply(member.userId, next, who)}
                        />
                        <RemoveButton
                          id={`remove-${member.userId}`}
                          who={who}
                          pending={pending}
                          describedBy={blocked ? describedBy : undefined}
                          onConfirm={() => apply(member.userId, null, who)}
                        />
                      </>
                    ) : (
                      <RoleChip role={member.role} reason="editor" />
                    )
                  }
                  after={
                    failed?.userId === member.userId ? (
                      <Alert variant="danger" className="mx-4 mb-3.5 text-left">
                        {isAccessError(failed.error)
                          ? accessErrorMessage(failed.error)
                          : m.members.changeFailed(failed.error)}
                      </Alert>
                    ) : null
                  }
                />
              </RowCardItem>
            );
          })}
        </RowCardList>
      </RowCard>
    </>
  );
}

/**
 * 역할 셀렉트.
 *
 * ⚠️ **사전 차단은 `aria-disabled`다, `disabled`가 아니다.** 진짜 `disabled`는 포커스를 못 받아
 * `aria-describedby`의 전달 경로가 없다 — 시안이 "꺼진 컨트롤에는 반드시 이유가 붙는다"를 요구하므로
 * 그 요구를 만족하는 유일한 형이다. 모양은 `select.tsx`가 든다(호출부가 철자를 발명하지 않는다).
 *
 * ⚠️ **막는 것이 셋이고, 셋 다 필요하다** (2026-09-19 code-review — 처음엔 둘이었고 둘 다 통했다).
 * Radix는 `composeEventHandlers`로 우리 핸들러를 먼저 돌리고 `defaultPrevented`면 자기 것을 건너뛴다:
 *   - `onPointerDown` — 마우스 경로. 막지 않으면 pointerdown에서 바로 열린다.
 *   - `onClick` — ⚠️ **막지 않으면 마우스 클릭이 그대로 연다.** `pointerTypeRef`가 `useRef("touch")`로
 *     시작하고 그것을 `"mouse"`로 바꾸는 코드가 **방금 건너뛴 Radix의 `onPointerDown` 첫 줄**이라,
 *     ref가 영원히 `"touch"`고 `onClick`의 `!== "mouse"` 갈래가 열어 준다.
 *   - `onKeyDown` — ⚠️ **화이트리스트다.** 여는 키 넷만 막으면 **타이프어헤드**가 남는다: Radix가
 *     `event.key.length === 1`이면 여는 키 판정보다 **먼저** 검색을 돌려 창을 열지 않고 값을 바꾼다.
 *     그리고 그 여는 키 목록은 라이브러리 내부 상수라 우리가 복제하면 버전이 올라갈 때 조용히 어긋난다.
 *
 * ⚠️ **`pending`은 진짜 `disabled`다** — 그쪽은 사유를 들려줄 것이 없고 잠깐이다. 두 축이 한 행에
 * 겹치지 않는다(차단된 행은 제출될 수 없다).
 */
function RoleSelect({
  member,
  who,
  pending,
  describedBy,
  onChange,
}: {
  member: MemberView;
  who: string;
  pending: boolean;
  describedBy: string | undefined;
  onChange: (next: Role) => void;
}) {
  const blocked = describedBy !== undefined;
  return (
    <Select value={member.role} disabled={pending} onValueChange={(value) => onChange(value as Role)}>
      {/* ⚠️ 라벨이 트리거 **밖**이다 — 안에 두면 자기 참조가 내용으로 풀릴 때 두 번 읽힌다 (리뷰 2026-09-13). */}
      <span id={`role-${member.userId}-label`} className="sr-only">
        {m.members.changeRole(who)}
      </span>
      <SelectTrigger
        id={`role-${member.userId}`}
        aria-labelledby={`role-${member.userId}-label role-${member.userId}`}
        aria-disabled={blocked || undefined}
        aria-describedby={describedBy}
        onPointerDown={blocked ? (event) => event.preventDefault() : undefined}
        onClick={blocked ? (event) => event.preventDefault() : undefined}
        // Tab만 통과시킨다 — 포커스는 받아야 사유가 낭독되고, 나머지는 전부 이 컨트롤의 동작이다.
        onKeyDown={blocked ? (event) => { if (event.key !== "Tab") event.preventDefault(); } : undefined}
        className="w-[132px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="OWNER">{m.projects.role.OWNER}</SelectItem>
        <SelectItem value="EDITOR">{m.projects.role.EDITOR}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * 제거는 되돌릴 수 없어 확인을 한 번 받는다 (DESIGN §6.4 — 제목은 대상을 명시한 질문).
 *
 * ⚠️ **`danger`이고 `ghost`가 아니다** (캔버스가 ghost를 명시적으로 기각했다): *"ghost는 행 위를 지나야
 * 존재가 드러나 «누를 수 있는 것인지 라벨인지» 모호했다."* 면을 채우지 않는 이유는 그러면 이 화면이
 * 통째로 제거하는 화면처럼 보이기 때문이고, 대개 이 화면을 여는 이유는 **보는 것**이다.
 *
 * ⚠️ **사전 차단된 행은 Dialog를 아예 세우지 않는다.** `preventDefault`로 트리거를 막는 형도
 * 리포에 있지만(`sync-button`), 되돌릴 수 없는 확인 창이 "열리긴 하는데 아무 일도 안 일어난다"가
 * 되는 것보다 **열리지 않는 편이 정직하다.**
 */
function RemoveButton({
  id,
  who,
  pending,
  describedBy,
  onConfirm,
}: {
  id: string;
  who: string;
  pending: boolean;
  describedBy: string | undefined;
  onConfirm: () => void;
}) {
  /* ⚠️ `aria-label`이 보이는 텍스트("Remove")를 **포함**한다 — 음성 입력이 라벨로 컨트롤을 찾으므로
     다른 문구로 바꾸면 "Remove 클릭"이 안 먹는다 (WCAG 2.5.3). */
  if (describedBy !== undefined) {
    return (
      <Button
        id={id}
        variant="danger"
        aria-label={m.members.removeLabel(who)}
        aria-disabled
        aria-describedby={describedBy}
        // ⚠️ **`loading`과 겸용 불가다** — 그쪽은 진짜 `disabled`를 걸어 사유의 전달 경로를 죽인다.
        onClick={(event) => event.preventDefault()}
      >
        {m.members.remove}
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button id={id} variant="danger" aria-label={m.members.removeLabel(who)} loading={pending}>
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
