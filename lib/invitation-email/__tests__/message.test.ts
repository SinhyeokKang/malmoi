import { describe, expect, it } from "vitest";

import { INVITATION_EMAIL_SUBJECT, buildInvitationEmail } from "../message";

/**
 * 개인별 초대 메일 payload (design §4). **본문은 초대 URL 한 줄이고 수신자는 한 명이다.**
 */

const base = {
  from: "malmoi <invite@notify.mal-moi.com>",
  origin: "https://mal-moi.com",
  to: "new@a.com",
  token: "tok_abc-123",
};

describe("buildInvitationEmail", () => {
  it("본문은 origin + /invite/<token> 한 줄이다", () => {
    const email = buildInvitationEmail(base);
    expect(email.text).toBe("https://mal-moi.com/invite/tok_abc-123");
    expect(email.text).not.toContain("\n");
  });

  it("수신자는 자기 한 명뿐이다", () => {
    expect(buildInvitationEmail(base).to).toEqual(["new@a.com"]);
  });

  it("제목과 발신자를 싣는다", () => {
    const email = buildInvitationEmail(base);
    expect(email.subject).toBe(INVITATION_EMAIL_SUBJECT);
    expect(INVITATION_EMAIL_SUBJECT).toBe("You're invited to malmoi");
    expect(email.from).toBe(base.from);
  });

  it("HTML·CC·BCC·reply_to·첨부·태그 필드가 없다", () => {
    expect(Object.keys(buildInvitationEmail(base)).sort()).toEqual(["from", "subject", "text", "to"]);
  });

  it("같은 입력은 같은 payload다", () => {
    expect(buildInvitationEmail(base)).toEqual(buildInvitationEmail(base));
  });

  it("수신자마다 자기 토큰만 든다 — 배치에서 다른 사람 링크가 섞이지 않는다", () => {
    const a = buildInvitationEmail({ ...base, to: "a@x.com", token: "tok_a" });
    const b = buildInvitationEmail({ ...base, to: "b@x.com", token: "tok_b" });
    expect(a.text).not.toContain("tok_b");
    expect(b.text).not.toContain("tok_a");
    expect(a.to).toEqual(["a@x.com"]);
    expect(b.to).toEqual(["b@x.com"]);
  });
});
