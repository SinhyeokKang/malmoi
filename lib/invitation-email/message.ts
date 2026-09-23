import { routes } from "@/lib/routes";

/**
 * 개인별 초대 메일 (design §4). **본문은 초대 URL 한 줄이다** — 프로젝트명·역할·HTML·추적을 넣지 않는다.
 * 수신자는 언제나 한 명이라 배치 안에서도 다른 사람의 주소·링크가 섞이지 않는다.
 */

export const INVITATION_EMAIL_SUBJECT = "You're invited to malmoi";

export type InvitationEmail = { from: string; to: [string]; subject: string; text: string };

export function buildInvitationEmail(input: { from: string; origin: string; to: string; token: string }): InvitationEmail {
  return {
    from: input.from,
    to: [input.to],
    subject: INVITATION_EMAIL_SUBJECT,
    text: `${input.origin}${routes.invite(input.token)}`,
  };
}
