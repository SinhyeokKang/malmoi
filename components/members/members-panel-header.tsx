"use client";

import { UserPlus } from "lucide-react";
import { useRef, useState } from "react";

import { InviteModal } from "@/components/members/invite-modal";
import { Button } from "@/components/ui/button";
import type { SeatNotice } from "@/lib/auth/seat-notice";
import { m } from "@/lib/i18n";

/**
 * 멤버 패널 머리의 우측 — **좌석 잔량 + [Invite]** 와 초대 모달의 소유자 (DESIGN §6.65).
 *
 * ⚠️ **[Invite]가 조건부 렌더에서 빠졌다.** 전에는 `canPerform(role, "member:manage") && <InviteDialog/>`
 * 였는데 그것은 **차단이 아니라 노출 판정**이었다 — 서버 거부는 `createInvitation`에 그대로 있다.
 * 감추면 EDITOR에게 오른쪽 끝이 통째로 비어 "왜 없는지"를 말할 자리조차 없다.
 *
 * ⚠️ **꺼진 버튼은 `aria-disabled`다** — 진짜 `disabled`는 포커스를 못 받아 사유의 전달 경로가 없다.
 * 시안이 "꺼진 버튼에는 반드시 이유가 붙는다"를 요구하므로 그 요구를 만족하는 유일한 형이다.
 * **`loading`과 겸용 불가다**(그쪽이 진짜 `disabled`를 건다) — 여기에 pending 상태가 없는 이유다.
 *
 * ⚠️ **좌석 판정은 서버가 한다** (`planSeatNotice`). 그 모듈이 `node:crypto`를 물어 클라이언트가
 * 값으로 import할 수 없고, 화면이 `MEMBER_LIMIT`을 따로 들면 서버 거부와 갈린다 — 타입만 import한다.
 *
 * ⚠️ **트리거를 `event.currentTarget`으로 잡는다** — `Button`은 ref를 안 받고, 리포의 다른 모달
 * (`publish-button.tsx`)이 이미 같은 관용구를 쓴다.
 */
const REASON_ID = "invite-reason";

export function MembersPanelHeader({ slug, notice }: { slug: string; notice: SeatNotice }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const label =
    notice.kind === "ownerOnly"
      ? m.members.ownerOnly
      : notice.kind === "seatsFull"
        ? m.members.seatsFull(notice.limit)
        : m.members.seats(notice.n, notice.limit);

  return (
    <div className="flex items-center gap-3">
      {/* 사유가 버튼 **왼쪽**에 선다 — 꺼진 버튼이 자기 이유를 이 문장으로 가리킨다. */}
      {/* ⚠️ **13px이다**(`text-xs`) — 카드 헤더 설명·행 메타와 같은 급이다. `text-sm`(14)이면 제목 옆에서 한 단계 무거워져 [Invite]와 제목 사이의 위계가 흐려진다 (캔버스 `1a`). */}
      <span id={REASON_ID} className="text-muted-foreground text-xs">{label}</span>
      <Button
        variant="primary"
        aria-disabled={notice.canInvite ? undefined : true}
        aria-describedby={notice.canInvite ? undefined : REASON_ID}
        onClick={(event) => {
          if (!notice.canInvite) {
            // 리포 선례와 같은 형이다 (`sync-button`·`new-project-button`) — `onClick` 미배선이 아니다.
            event.preventDefault();
            return;
          }
          triggerRef.current = event.currentTarget;
          setOpen(true);
        }}
      >
        <UserPlus aria-hidden />
        {m.members.invite.open}
      </Button>
      {/* 좌석이 열려 있을 때만 모달이 존재한다 — 닫힌 갈래에는 열 창이 없다. */}
      {notice.canInvite && (
        <InviteModal
          slug={slug}
          open={open}
          onClose={() => setOpen(false)}
          seats={{ n: notice.n, limit: notice.limit }}
          returnFocusRef={triggerRef}
        />
      )}
    </div>
  );
}
