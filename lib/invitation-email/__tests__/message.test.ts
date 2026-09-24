import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INVITATION_EMAIL_LOGO_URL, INVITATION_EMAIL_SUBJECT, buildInvitationEmail } from "../message";

/**
 * 개인별 초대 메일 payload (design §4). **text는 초대 URL 한 줄, html은 Claude Design 시안(`email/invite.html`)이고
 * 수신자는 한 명이다.** 원격 이미지는 자사 도메인 고정 URL 로고 하나뿐이다 — 수신자별 값이 붙지 않으므로 열람 추적이 아니다.
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

  it("CC·BCC·reply_to·첨부·태그 필드가 없다", () => {
    expect(Object.keys(buildInvitationEmail(base)).sort()).toEqual(["from", "html", "subject", "text", "to"]);
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

describe("buildInvitationEmail — html", () => {
  const url = "https://mal-moi.com/invite/tok_abc-123";

  it("시안의 네 자리(버튼·Outlook 버튼·대체 링크 href·표시)에 같은 URL이 들어가고 변수가 남지 않는다", () => {
    const { html } = buildInvitationEmail(base);
    expect(html.split(url).length - 1).toBe(4);
    expect(html).not.toContain("{{");
  });

  it("URL을 HTML 이스케이프한다 — 속성·본문을 깨지 않는다", () => {
    const { html } = buildInvitationEmail({ ...base, token: `a"<b>&c` });
    expect(html).not.toContain(`a"<b>&c`);
    expect(html).toContain("a&quot;&lt;b&gt;&amp;c");
  });

  it("이미지는 고정 URL 로고 하나다 — 쿼리·수신자별 값이 없다", () => {
    const { html } = buildInvitationEmail(base);
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(INVITATION_EMAIL_LOGO_URL).toBe("https://mal-moi.com/email/logo@2x.png");
    expect(html).toContain(`src="${INVITATION_EMAIL_LOGO_URL}"`);
    expect(html).not.toMatch(/src="(?!https:\/\/mal-moi\.com\/email\/logo@2x\.png")/);
    expect(html).toContain('alt="malmoi"');
  });

  it("프로젝트명·역할·수신 주소를 싣지 않는다", () => {
    const { html } = buildInvitationEmail(base);
    expect(html).not.toContain(base.to);
    expect(html).not.toMatch(/OWNER|EDITOR/);
  });

  it("Gmail 잘림(102KB) 아래다", () => {
    expect(Buffer.byteLength(buildInvitationEmail(base).html)).toBeLessThan(100 * 1024);
  });

  it("로고 PNG가 public/email/에 80×80으로 있다 — 표시 40×40의 @2x", () => {
    const png = readFileSync("public/email/logo@2x.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 80]);
  });
});
