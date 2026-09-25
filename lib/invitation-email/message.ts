import { routes } from "@/lib/routes";

import { INVITATION_EMAIL_HTML } from "./template";

/**
 * 개인별 초대 메일 (design §4). **text는 초대 URL 한 줄, html은 시안(`template.ts`)이다** — 프로젝트명·역할·
 * 초대한 사람·추적을 넣지 않는다. 수신자는 언제나 한 명이라 배치 안에서도 다른 사람의 주소·링크가 섞이지 않는다.
 */

export const INVITATION_EMAIL_SUBJECT = "You're invited to Malmoi";
/**
 * ⚠️ **프로덕션 고정 URL이다** — dev·로컬 메일도 이 주소를 쓴다. preview 호스트는 Vercel SSO 뒤라 메일
 * 클라이언트가 이미지를 못 받는다. 파일이 프로덕션에 배포되기 전에는 alt 텍스트가 워드마크 자리를 채운다.
 */
export const INVITATION_EMAIL_LOGO_URL = "https://mal-moi.com/email/logo@2x.png";

export type InvitationEmail = { from: string; to: [string]; subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildInvitationEmail(input: { from: string; origin: string; to: string; token: string }): InvitationEmail {
  const url = `${input.origin}${routes.invite(input.token)}`;
  return {
    from: input.from,
    to: [input.to],
    subject: INVITATION_EMAIL_SUBJECT,
    text: url,
    // replaceAll에 문자열을 넘기면 `$&` 같은 치환 패턴이 해석된다 — 함수로 넘겨 값 그대로 넣는다.
    html: INVITATION_EMAIL_HTML.replaceAll("{{LOGO_URL}}", () => INVITATION_EMAIL_LOGO_URL).replaceAll("{{INVITE_URL}}", () => escapeHtml(url)),
  };
}
