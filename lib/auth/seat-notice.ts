import { planInvitationCreate } from "./invitation";
import { canPerform, type Role } from "./permission";

/**
 * 멤버 패널 헤더 우측이 무엇을 말하고 [Invite]가 열려 있는가 (DESIGN §6.65).
 *
 * ⚠️ **사전 차단은 편의이고 차단이 아니다.** 다른 탭이 그 사이에 좌석을 채울 수 있으므로 서버 거부
 * (`createInvitations` 안의 잠긴 집계)는 그대로 남는다. 여기서 지키는 것은 **같은 상황에 두 문장이
 * 서지 않는 것**이고, 그래서 판정을 다시 쓰지 않고 `planInvitationCreate`를 그대로 부른다.
 *
 * ⚠️ **서버 전용이다** — `lib/auth/invitation.ts`가 `node:crypto`를 문다. `page.tsx`가 부르고
 * `SeatNotice` 값을 prop으로 내린다. 클라이언트가 이 모듈을 값으로 읽으면 `client-graph.test.ts`가 red다.
 */
export type SeatNotice =
  | { kind: "seats"; n: number; limit: number; canInvite: true }
  | { kind: "seatsFull"; n: number; limit: number; canInvite: false }
  | { kind: "ownerOnly"; canInvite: false };

export function planSeatNotice(input: { role: Role; memberCount: number }): SeatNotice {
  /**
   * ⚠️ **역할이 좌석보다 먼저다.** EDITOR에게 `10 of 10 seats — remove someone to invite`를 보이면
   * "누군가 나가면 내가 초대할 수 있다"로 읽히는데 거짓이다 — 좌석이 비어도 그 사람은 초대할 수 없다.
   * 사유는 **그 사람이 할 수 있는 일**을 말해야 한다.
   */
  if (!canPerform(input.role, "member:manage")) return { kind: "ownerOnly", canInvite: false };

  // 서버 거부와 **같은 함수**다 — 경계가 갈리면 화면이 열어 둔 버튼이 눌러야만 거부된다.
  const seats = planInvitationCreate({ memberCount: input.memberCount });
  return seats.status === "ok"
    ? { kind: "seats", n: input.memberCount, limit: seats.limit, canInvite: true }
    : { kind: "seatsFull", n: input.memberCount, limit: seats.limit, canInvite: false };
}
