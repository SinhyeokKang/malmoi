import { planInvitationAccept, type InvitationRow } from "./invitation";
import type { InviteError } from "./message";

export type InviteView =
  | { kind: "blocked"; notice: InviteError; retry: boolean }
  | { kind: "sign-in"; notice: InviteError | null }
  | { kind: "accept"; notice: InviteError | null }
  | { kind: "wrong-account"; notice: "email-mismatch" | "already-member" };

/** 이전 Action의 쿼리보다 현재 초대의 판정을 우선한다. */
export function planInviteView(input: {
  session: "ok" | "none" | "unavailable";
  /** undefined는 읽기 실패이고 null은 행 없음이다. */
  invitation: InvitationRow | null | undefined;
  viewerEmail: string | null;
  alreadyMember: boolean;
  queryError: string | undefined;
  now: Date;
}): InviteView {
  if (input.session === "unavailable" || input.invitation === undefined) {
    return { kind: "blocked", notice: "unavailable", retry: true };
  }
  const acceptance = planInvitationAccept({
    invitation: input.invitation,
    verifiedEmail: input.viewerEmail ?? "",
    now: input.now,
  });
  if (acceptance === "not-found" || acceptance === "already-accepted" || acceptance === "expired") {
    return { kind: "blocked", notice: acceptance, retry: false };
  }

  // 주소창의 프로토타입 키까지 거부하도록 아는 문자열만 고른다.
  let notice: InviteError | null = null;
  switch (input.queryError) {
    case "unauthorized":
    case "unavailable":
    case "not-found":
    case "already-accepted":
    case "expired":
    case "email-mismatch":
    case "already-member":
      notice = input.queryError;
  }
  if (input.session === "none") return { kind: "sign-in", notice };
  if (acceptance === "email-mismatch") return { kind: "wrong-account", notice: "email-mismatch" };
  if (input.alreadyMember) return { kind: "wrong-account", notice: "already-member" };
  return { kind: "accept", notice };
}
