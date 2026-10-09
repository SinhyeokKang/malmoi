import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { hueOf, HUES, type Hue } from "@/lib/hue";

import { INVITATION_EMAIL_LOGO_URL, INVITATION_EMAIL_SUBJECT, HUE_HEX, buildInvitationEmail, emailProjectName } from "../message";
import { INVITATION_EMAIL_HTML, INVITATION_EMAIL_TILE_FALLBACK, INVITATION_EMAIL_TILE_IMAGE } from "../template";

/**
 * 개인별 초대 메일 payload (design §4 · invitation-email-project). **text는 초대 URL 한 줄이고, html은 링크와
 * 프로젝트 카드(썸네일·이름·역할)를 싣는다.** 수신자는 한 명이다. 원격 이미지는 전부 `mal-moi.com` 고정 경로이고
 * 수신자별 값이 붙지 않으므로 열람 추적이 아니다.
 *
 * ⚠️ 메일은 `ImageTile`·`Avatar` 밖의 이미지 매핑 소비자라 `components/__tests__/image-origin.test.tsx`가 안 본다 —
 * 여기의 `vercel-storage.com` 0건 단언이 유일한 방어선이다.
 */

const project = { name: "Acme Web", image: null as string | null };
const base = {
  from: "malmoi <invite@notify.mal-moi.com>",
  origin: "https://mal-moi.com",
  to: "new@a.com",
  token: "tok_abc-123",
  project,
  role: "EDITOR" as const,
};

const BLOB = "https://abc123.public.blob.vercel-storage.com/projects/p_1/thumb-x.webp";
// 메일은 PNG 변환 경로를 쓴다 (#140 — Gmail이 WebP 알파를 버린다).
const PROXIED = "https://mal-moi.com/api/images/email/projects/p_1/thumb-x.webp";
const BOX_URL = "https://mal-moi.com/email/box@2x.png";

function preheader(html: string): string {
  return /<div style="display:none[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
}

describe("buildInvitationEmail", () => {
  it("본문은 origin + /invite/<token> 한 줄이다", () => {
    const email = buildInvitationEmail(base);
    expect(email.text).toBe("https://mal-moi.com/invite/tok_abc-123");
    expect(email.text).not.toContain("\n");
  });

  it("수신자는 자기 한 명뿐이다", () => {
    expect(buildInvitationEmail(base).to).toEqual(["new@a.com"]);
  });

  it("제목은 고정 문구이고 발신자를 싣는다", () => {
    const email = buildInvitationEmail(base);
    expect(email.subject).toBe(INVITATION_EMAIL_SUBJECT);
    expect(INVITATION_EMAIL_SUBJECT).toBe("You're invited to a project on Malmoi");
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

  it("제목·preheader·text에 프로젝트 이름·역할이 없다 — 받은편지함 목록에 OWNER 입력이 서지 않는다", () => {
    const email = buildInvitationEmail({ ...base, project: { name: "Zebra Launch", image: BLOB }, role: "OWNER" });
    for (const part of [email.subject, preheader(email.html), email.text]) {
      expect(part).not.toContain("Zebra");
      expect(part).not.toMatch(/Owner|OWNER/);
    }
    expect(preheader(email.html)).toContain("You've been invited to a project on Malmoi.");
  });
});

describe("buildInvitationEmail — html", () => {
  const url = "https://mal-moi.com/invite/tok_abc-123";

  it("네 자리(버튼·Outlook 버튼·대체 링크 href·표시)에 같은 URL이 들어가고 변수가 남지 않는다", () => {
    for (const image of [null, BLOB]) {
      const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
      expect(html.split(url).length - 1).toBe(4);
      expect(html).not.toContain("{{");
    }
  });

  it("URL을 HTML 이스케이프한다 — 속성·본문을 깨지 않는다", () => {
    const { html } = buildInvitationEmail({ ...base, token: `a"<b>&c` });
    expect(html).not.toContain(`a"<b>&c`);
    expect(html).toContain("a&quot;&lt;b&gt;&amp;c");
  });

  it("<title>·h1·본문 문장이 새 문구다", () => {
    const { html } = buildInvitationEmail(base);
    expect(html).toContain("<title>You're invited to a project on Malmoi</title>");
    expect(html).toMatch(/<h1[^>]*>You're invited to a project on Malmoi<\/h1>/);
    // 본문은 제목을 되풀이하지 않고 Malmoi가 무엇인지 말한다(2026-10-06 사용자) — 프로젝트·역할은 바로 아래 카드가 든다.
    expect(html).toContain("Malmoi is where your team translates your app's text and sends it back to GitHub.");
    expect(html).not.toContain("You've been invited to join this project");
    expect(html).not.toContain("Someone has");
    expect(html).not.toContain("Accept the invitation to get started.");
  });

  it("카드가 문장과 버튼 사이에 선다 — 폭 100%, 테두리 #e5e5e5, radius 12", () => {
    const { html } = buildInvitationEmail(base);
    const sentence = html.indexOf("Malmoi is where your team translates");
    const name = html.indexOf(">Acme Web<");
    const button = html.indexOf('class="mm-btn"');
    expect(sentence).toBeGreaterThan(-1);
    expect(sentence).toBeLessThan(name);
    expect(name).toBeLessThan(button);
    expect(html).toMatch(/<table role="presentation" width="100%"[^>]*style="[^"]*border:1px solid #e5e5e5;border-radius:12px/);
  });

  it.each([
    ["EDITOR", "Editor"],
    ["OWNER", "Owner"],
  ] as const)("역할 %s는 화면 낱말 %s로 선다 — 내부 이름을 싣지 않는다", (role, label) => {
    const { html } = buildInvitationEmail({ ...base, role });
    expect(html).toContain(`>${label}<`);
    expect(html).not.toMatch(/OWNER|EDITOR/);
  });

  it("수신 주소를 싣지 않는다", () => {
    expect(buildInvitationEmail(base).html).not.toContain(base.to);
  });

  it("Gmail 잘림(102KB) 아래다", () => {
    const longName = "가".repeat(200);
    expect(Buffer.byteLength(buildInvitationEmail({ ...base, project: { name: longName, image: BLOB } }).html)).toBeLessThan(100 * 1024);
  });

  it("로고 PNG가 public/email/에 80×80으로 있다 — 표시 40×40의 @2x", () => {
    const png = readFileSync("public/email/logo@2x.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 80]);
  });

  it("폴백 타일의 Box PNG가 public/email/에 32×32 RGBA로 있다 — 표시 16×16의 @2x, 톤 배경이 비쳐야 한다", () => {
    const png = readFileSync("public/email/box@2x.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([32, 32]);
    // IHDR color type 6 = truecolor + alpha. 불투명 PNG면 톤 셀 위에 사각이 선다.
    expect(png[25]).toBe(6);
  });
});

describe("buildInvitationEmail — 가운데 정렬 (2026-10-04 사용자)", () => {
  const html = buildInvitationEmail(base).html;
  const openTag = (re: RegExp) => re.exec(html)?.[1] ?? "";

  it("로고 칸이 가운데이고 로고 <img>는 margin auto로 선다", () => {
    expect(openTag(/<tr><td([^>]*)><img src="https:\/\/mal-moi\.com\/email\/logo@2x\.png"/)).toContain('align="center"');
    expect(/<img src="https:\/\/mal-moi\.com\/email\/logo@2x\.png"[^>]*style="([^"]*)"/.exec(html)?.[1]).toContain("margin:0 auto");
  });

  it("본문 칸(h1·문장·대체 링크·만료 안내)과 꼬리말이 text-align:center다", () => {
    expect(openTag(/<td class="mm-card-pad"([^>]*)>/)).toMatch(/align="center"[^>]*text-align:center/);
    expect(openTag(/<td([^>]*)>This link expires in 7 days\./)).toContain("text-align:center");
    expect(openTag(/<td([^>]*)>If you weren't expecting this invitation/)).toContain("text-align:center");
  });

  it("버튼이 칼럼 폭 전체를 채운다 (2026-10-06 사용자 — 로그인 폼의 전폭 버튼과 같다)", () => {
    const table = openTag(/<table([^>]*)>\s*<tr><td align="center" bgcolor="#171717"/);
    expect(table).toContain('width="100%"');
    expect(table).toContain("width:100%");
    expect(table).toContain("margin:0 0 8px 0");
    expect(/<a class="mm-btn"[^>]*style="([^"]*)"/.exec(html)?.[1]).toContain("display:block");
    // Outlook VML 버튼은 %를 못 받는다 — 칼럼 폭 그대로다.
    expect(html).toMatch(/<v:roundrect[^>]*style="[^"]*width:320px;/);
  });

  it("버튼 표는 border-collapse:separate다 — 전역 collapse 아래선 칸의 radius가 테두리에 안 걸려 각진 1px 테두리가 남는다", () => {
    expect(INVITATION_EMAIL_HTML).toContain("table{border-collapse:collapse}");
    expect(openTag(/<table([^>]*)>\s*<tr><td align="center" bgcolor="#171717"/)).toContain("border-collapse:separate");
  });

  it("본문 칼럼이 로그인 폼 칼럼과 같은 320이다 (2026-10-06 사용자 — 옛 560)", () => {
    expect(html).toMatch(/<!--\[if mso\]><table role="presentation" width="320"/);
    expect(html).toContain("max-width:320px;width:100%;");
    expect(html).not.toContain("560");
  });

  it("카드는 칼럼 폭 그대로이고, 안의 타일·이름 묶음은 왼쪽 정렬이다 (2026-10-06 사용자)", () => {
    const card = openTag(/<table([^>]*)>\s*<tr><td style="padding:12px;/);
    expect(card).toContain("width:100%");
    expect(card).not.toContain("max-width");
    expect(openTag(/<tr><td( style="padding:12px;[^>]*)>/)).toContain("text-align:left");
    const row = openTag(/<table([^>]*)>\s*<tr>\s*<td width="32"/);
    expect(row).not.toContain('align="center"');
    expect(row).not.toContain("margin:0 auto");
    expect(row).not.toContain('width="100%"');
    expect(openTag(/<td([^>]*)>\s*<div style="font-size:14px/)).toContain("text-align:left");
  });
});

describe("buildInvitationEmail — 간격은 로그인 폼 칼럼과 같은 두 단계다 (2026-10-06 사용자)", () => {
  // `AuthColumn`: 덩어리 사이 16 · 덩어리 안 8. 덩어리는 로고 / 제목+문장 / 카드 / 버튼+대체 링크다.
  const html = buildInvitationEmail(base).html;
  const style = (re: RegExp) => re.exec(html)?.[1] ?? "";

  it("로고 → 제목 16 · 제목 → 문장 8 · 문장 → 카드 16 · 카드 → 버튼 16", () => {
    expect(style(/<td class="mm-card-pad"[^>]*style="([^"]*)"/)).toContain("padding:16px 0 24px 0");
    expect(style(/<h1[^>]*style="([^"]*)"/)).toContain("margin:0 0 8px 0");
    expect(style(/<p style="([^"]*)">Malmoi is where your team translates/)).toContain("margin:0 0 16px 0");
    expect(style(/<table[^>]*style="([^"]*border:1px solid #e5e5e5[^"]*)"/)).toContain("margin:0 0 16px 0");
  });

  it("버튼 → 대체 안내 8 · 안내 → 링크 4 · 링크 → 구분선 24 · 구분선 → 만료 안내 16", () => {
    expect(style(/<table[^>]*style="([^"]*)">\s*<tr><td align="center" bgcolor="#171717"/)).toContain("margin:0 0 8px 0");
    expect(style(/<p style="([^"]*)">If the button doesn't work/)).toContain("margin:0 0 4px 0");
    expect(style(/<p style="([^"]*)"><a href="https:\/\/mal-moi\.com\/invite\//)).toContain("margin:0 0 24px 0");
    expect(style(/<td[^>]*style="([^"]*)">This link expires in 7 days\./)).toContain("padding-top:16px");
  });

  it("좁은 화면에서 본문 칸 여백을 다시 덮지 않는다 — 데스크톱과 같은 값이다", () => {
    expect(html).not.toContain(".mm-card-pad{");
  });
});

describe("buildInvitationEmail — 이미지", () => {
  const ALLOWED_SRC = /^(https:\/\/mal-moi\.com\/email\/(logo|box)@2x\.png|https:\/\/mal-moi\.com\/api\/images\/email\/projects\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpeg|webp))$/;

  function srcs(html: string): string[] {
    return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1] ?? "");
  }

  it.each([null, BLOB])("두 갈래 모두 <img>가 둘(로고 + 타일)이고 src는 허용된 자사 고정 경로뿐이다 — 쿼리·수신자별 값 없음 (image=%s)", (image) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
    expect(html.match(/<img\b/g)).toHaveLength(2);
    for (const src of srcs(html)) expect(src).toMatch(ALLOWED_SRC);
    expect(INVITATION_EMAIL_LOGO_URL).toBe("https://mal-moi.com/email/logo@2x.png");
    expect(html.split(`src="${INVITATION_EMAIL_LOGO_URL}"`).length - 1).toBe(1);
    expect(html).toContain('alt="Malmoi"');
  });

  it("썸네일이 있으면 자사 프록시 경로로 싣는다 — width 속성 없이 32 상자 안에, radius는 img에, 셀 bgcolor 없음", () => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image: BLOB } });
    const img = new RegExp(`<img src="${PROXIED.replace(/[.]/g, "\\.")}"[^>]*>`).exec(html)?.[0];
    expect(img).toBeDefined();
    expect(img).not.toMatch(/\swidth=/);
    expect(img).not.toMatch(/\sheight=/);
    expect(img).toContain("max-width:32px;max-height:32px");
    expect(img).toContain("border-radius:8px");
    expect(img).toContain('alt=""');
    const cell = /<td([^>]*)>\s*<img src="https:\/\/mal-moi\.com\/api\/images\//.exec(html)?.[1];
    expect(cell).toBeDefined();
    expect(cell).not.toContain("bgcolor");
    expect(cell).not.toContain("background");
    expect(html).not.toContain(BOX_URL);
  });

  it.each([
    ["null", null],
    ["빈 문자열", ""],
    ["우리 스토어가 아닌 https URL", "https://example.com/projects/p_1/thumb-x.webp"],
    ["아바타 키", "https://abc123.public.blob.vercel-storage.com/avatars/u_1/a.webp"],
  ])("썸네일 키가 안 나오는 값(%s)은 톤 셀 + Box PNG 폴백이다", (_name, image) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
    expect(html).not.toContain("/api/images/");
    const hex = HUE_HEX[hueOf(project.name)];
    expect(html).toMatch(new RegExp(`<td[^>]*bgcolor="${hex}"[^>]*>\\s*<img src="${BOX_URL.replace(/[.]/g, "\\.")}" width="16" height="16"`));
    expect(html).toMatch(new RegExp(`<img src="${BOX_URL.replace(/[.]/g, "\\.")}"[^>]*alt=""`));
  });

  it.each([
    null,
    "",
    BLOB,
    `${BLOB}?download=1`,
    "https://abc123.public.blob.vercel-storage.com/../x.png",
    "https://abc123.public.blob.vercel-storage.com/avatars/u_1/a.webp",
    "https://abc123.public.blob.vercel-storage.com/projects/p_1/x.gif",
  ])("어느 입력(%s)이든 html에 vercel-storage.com이 0건이다", (image) => {
    expect(buildInvitationEmail({ ...base, project: { ...project, image } }).html).not.toContain("vercel-storage.com");
  });
});

/**
 * **타일은 이미지가 막히거나 깨져도 32×32 정사각이다** (malmoi#140 — Gmail iOS 폴백 갈래에서 세로로 늘었다).
 *
 * 텍스트 열(이름 20 + 1 + 역할 17 = 38px)이 32보다 높아 같은 행의 타일 `<td>`가 38로 늘어난다 — `height`는 셀의
 * 최소값이다. 그래서 색을 든 셀은 행에서 떼어 **고정 크기 중첩 표** 안에 두고, 행 쪽 셀은 색 없이 가운데 정렬만
 * 한다. 셀 안의 인라인 자리표시(깨진 이미지 아이콘·공백)가 줄 높이로 셀을 밀지 못하게 `line-height:0;font-size:0`.
 */
describe("buildInvitationEmail — 타일 정사각", () => {
  const BRANCHES = [
    ["폴백", null, BOX_URL],
    ["썸네일", BLOB, "https://mal-moi.com/api/images/"],
  ] as const;

  function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }

  it.each(BRANCHES)("%s 갈래: 타일 셀이 style에 32px 고정·line-height 0·font-size 0·overflow hidden을 든다", (_name, image, src) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
    const cell = new RegExp(`<td([^>]*)>\\s*<img src="${escapeRe(src)}`).exec(html)?.[1];
    expect(cell).toBeDefined();
    expect(cell).toMatch(/width="32"/);
    expect(cell).toMatch(/height="32"/);
    const style = /style="([^"]*)"/.exec(cell ?? "")?.[1] ?? "";
    for (const decl of ["width:32px", "height:32px", "max-height:32px", "line-height:0", "font-size:0", "overflow:hidden"]) expect(style).toContain(decl);
  });

  it.each(BRANCHES)("%s 갈래: 타일 셀은 32×32 고정 중첩 표 안에 있다 — 행 높이(텍스트 38px)가 셀을 늘리지 못한다", (_name, image, src) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
    const wrapper = new RegExp(`<table([^>]*)>\\s*<tr>\\s*<td[^>]*>\\s*<img src="${escapeRe(src)}`).exec(html)?.[1];
    expect(wrapper).toBeDefined();
    expect(wrapper).toContain('role="presentation"');
    expect(wrapper).toMatch(/width="32"/);
    expect(wrapper).toMatch(/height="32"/);
    expect(wrapper).toMatch(/style="[^"]*width:32px;height:32px/);
  });

  it.each(BRANCHES)("%s 갈래: 행에 붙은 바깥 셀은 색이 없고 세로 가운데다 — 늘어나도 보이지 않는다", (_name, image) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image } });
    const outer = /<td([^>]*)>\s*<table[^>]*width="32"/.exec(html)?.[1];
    expect(outer).toBeDefined();
    expect(outer).not.toContain("bgcolor");
    expect(outer).not.toContain("background");
    expect(outer).toContain('valign="middle"');
  });

  it("폴백 갈래: Box <img>는 style로 16px 고정 + display:block이다", () => {
    const { html } = buildInvitationEmail(base);
    const img = new RegExp(`<img src="${escapeRe(BOX_URL)}"[^>]*>`).exec(html)?.[0] ?? "";
    expect(img).toContain('width="16"');
    expect(img).toContain('height="16"');
    expect(img).toMatch(/style="[^"]*display:block;width:16px;height:16px/);
  });

  it("썸네일 갈래: 비율 규칙은 그대로다 — width·height 속성 없이 max 32", () => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image: BLOB } });
    const img = new RegExp(`<img src="${escapeRe(PROXIED)}"[^>]*>`).exec(html)?.[0] ?? "";
    expect(img).not.toMatch(/\s(width|height)=/);
    expect(img).toContain("max-width:32px;max-height:32px");
  });
});

describe("buildInvitationEmail — 프로젝트 이름", () => {
  it("평범한 이름은 원문 그대로 선다", () => {
    expect(buildInvitationEmail(base).html).toContain(">Acme Web<");
  });

  it("HTML 특수문자를 이스케이프한다 — 이스케이프 안 된 <·\"·'·&가 없다", () => {
    const name = `<script>alert("x")</script> & 'y'`;
    const { html } = buildInvitationEmail({ ...base, project: { ...project, name } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(name);
    expect(html).toContain(">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;<");
  });

  it("$&·$1 같은 치환 패턴을 해석하지 않는다", () => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, name: "Cost $& $1 $$" } });
    expect(html).toContain(">Cost $&amp; $1 $$<");
  });

  it.each(["{{INVITE_URL}}", "{{LOGO_URL}}", "{{ROLE}}", "{{TILE}}", "{{PROJECT_NAME}}"])("이름 안의 %s는 다시 전개되지 않고 문자 그대로 선다 — 단일 패스", (name) => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, name } });
    expect(html).toContain(`>${name}<`);
    expect(html.split(name).length - 1).toBe(1);
    expect(html.split("https://mal-moi.com/invite/tok_abc-123").length - 1).toBe(4);
    expect(html.split(`src="${INVITATION_EMAIL_LOGO_URL}"`).length - 1).toBe(1);
    expect(html.match(/<img\b/g)).toHaveLength(2);
  });

  it("긴 이름은 잘린 뒤 이스케이프된다 — 59자 + &는 & 엔티티가 중간에서 잘리지 않는다", () => {
    const name = `${"a".repeat(59)}&bc`;
    const { html } = buildInvitationEmail({ ...base, project: { ...project, name } });
    expect(html).toContain(`>${"a".repeat(59)}…<`);
    const name2 = `${"a".repeat(58)}&bc`;
    expect(buildInvitationEmail({ ...base, project: { ...project, name: name2 } }).html).toContain(`>${"a".repeat(58)}&amp;…<`);
  });

  it("톤은 자르기 전 원래 이름으로 고른다 — 화면 타일과 같은 색", () => {
    let name = "";
    for (let i = 0; i < 1000; i++) {
      const candidate = `${"p".repeat(60)}${i}`;
      if (hueOf(candidate) !== hueOf(emailProjectName(candidate))) {
        name = candidate;
        break;
      }
    }
    expect(name).not.toBe("");
    const { html } = buildInvitationEmail({ ...base, project: { name, image: null } });
    expect(html).toContain(`bgcolor="${HUE_HEX[hueOf(name)]}"`);
  });
});

describe("emailProjectName — grapheme 60개 상한", () => {
  it("60 grapheme 이하는 그대로다", () => {
    expect(emailProjectName("a".repeat(60))).toBe("a".repeat(60));
    expect(emailProjectName("")).toBe("");
    expect(emailProjectName("가".repeat(60))).toBe("가".repeat(60));
  });

  it("61 grapheme이면 앞 59개 + …다 (… 포함 60)", () => {
    expect(emailProjectName("a".repeat(61))).toBe(`${"a".repeat(59)}…`);
  });

  it.each([
    ["ZWJ 가족 이모지", "👨‍👩‍👧"],
    ["국기 쌍", "🇰🇷"],
    ["결합 문자", "é"],
  ])("%s를 중간에서 자르지 않는다", (_name, g) => {
    expect(emailProjectName(g.repeat(60))).toBe(g.repeat(60));
    expect(emailProjectName(g.repeat(61))).toBe(`${g.repeat(59)}…`);
  });

  it("이스케이프하지 않는다 — 자르기만 하고 이스케이프는 조립이 한다", () => {
    expect(emailProjectName("A & B")).toBe("A & B");
  });
});

/**
 * 메일 톤 hex는 Tailwind v4 `theme.css`의 `--color-<tone>-600` oklch를 sRGB로 환산해 **채널별 0–1 clamp**한 값이다
 * (gamut mapping 아님 — design §3). 손으로 적은 상수끼리 비교하면 v3 값도 통과하므로 원본 CSS에서 환산한다.
 * `visual-system.test.ts`는 `app`·`components`만 훑어 이것이 유일한 방어선이다(POSTMORTEM 2026-09-17).
 */
describe("HUE_HEX", () => {
  const globals = readFileSync("app/globals.css", "utf8");
  // 실제 앱의 override/별칭을 기본 팔레트 뒤에 적용한다. 이메일 런타임에는 CSS를 넣지 않는다.
  const css = `${readFileSync("node_modules/tailwindcss/theme.css", "utf8")}\n${globals}`;
  // ⚠️ 앱 토큰은 `light-dark(라이트, 다크)`다(color-scheme Phase 2). 메일은 라이트 고정(`color-scheme: light` 메타)이라 **라이트 쪽**과 대조한다.
  const lightSide = (value: string): string => {
    const body = /^light-dark\(([\s\S]*)\)$/.exec(value)?.[1];
    if (body === undefined) return value;
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") depth--;
      else if (body[i] === "," && depth === 0) return body.slice(0, i).trim();
    }
    return value;
  };
  const variables = new Map([...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1]!, lightSide(match[2]!.trim())]));

  function channelsHex(channels: number[]): string {
    if (!channels.every(Number.isFinite)) throw new Error("비유한 색 채널");
    return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
  }

  function hslToHex(h: number, s: number, l: number): string {
    const hue = ((h % 360) + 360) % 360 / 60;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(hue % 2 - 1));
    const channels = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return channelsHex(channels.map((channel) => (channel + l - chroma / 2) * 255));
  }

  function oklchToHex(l: number, c: number, h: number): string {
    const a = c * Math.cos((h * Math.PI) / 180);
    const b = c * Math.sin((h * Math.PI) / 180);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
    if (!linear.every(Number.isFinite)) throw new Error("비유한 색 채널");
    return `#${linear
      .map((v) => {
        const clamped = Math.min(1, Math.max(0, v));
        const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
        return Math.round(srgb * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")}`;
  }

  // CSS <number>: 소수점 뒤에는 숫자가 필요하며 지수 표기는 유한한 값만 받는다.
  const number = "[+-]?(?:\\d*\\.\\d+|\\d+)(?:[eE][+-]?\\d+)?";
  const hslPattern = new RegExp(`^hsl\\((${number})\\s+(${number})%\\s+(${number})%\\)$`);
  const rgbPattern = new RegExp(`^rgb\\((${number})\\s+(${number})\\s+(${number})\\)$`);
  const oklchPattern = new RegExp(`^oklch\\((${number})%\\s+(${number})\\s+(${number}|none)\\)$`);
  function numericChannels(parts: string[]): number[] {
    const channels = parts.map(Number);
    if (!channels.every(Number.isFinite)) throw new Error("비유한 색 채널");
    return channels;
  }

  function colorHex(name: string, seen = new Set<string>()): string {
    const value = variables.get(name);
    if (value === undefined || seen.has(name)) throw new Error(`실재 색 선언을 못 풀었다: ${name}`);
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (alias) return colorHex(alias[1]!, new Set([...seen, name]));
    const hsl = hslPattern.exec(value);
    if (hsl) {
      const [h, s, l] = numericChannels(hsl.slice(1));
      return hslToHex(h!, s! / 100, l! / 100);
    }
    const rgb = rgbPattern.exec(value);
    if (rgb) return channelsHex(numericChannels(rgb.slice(1)));
    // theme.css의 `--color-white: #fff` — 식별색 위 글자 `--on-hue`가 가리킨다(color-scheme Phase 1).
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
    if (hex) return `#${hex[1]!.length === 3 ? [...hex[1]!].map((digit) => digit + digit).join("") : hex[1]!}`.toLowerCase();
    const oklch = oklchPattern.exec(value);
    if (oklch) {
      const [l, c, h] = numericChannels([oklch[1]!, oklch[2]!, oklch[3] === "none" ? "0" : oklch[3]!]);
      if (oklch[3] !== "none" || c === 0) return oklchToHex(l! / 100, c!, h!);
    }
    throw new Error(`지원하지 않는 색 선언: ${name}: ${value}`);
  }

  const expected = (hue: Hue): string => colorHex(`--color-${hue}-600`);

  it("톤 여덟 전부가 theme.css -600의 sRGB clamp 환산값과 같다", () => {
    expect(Object.keys(HUE_HEX).sort()).toEqual([...HUES].sort());
    for (const hue of HUES) expect(HUE_HEX[hue], hue).toBe(expected(hue));
  });

  it("환산 자체가 설계 표와 맞는다 — 환산식이 틀리면 둘 다 같이 틀리는 것을 막는다", () => {
    expect(expected("rose")).toBe("#ec003f");
    expect(expected("indigo")).toBe("#4f39f6");
  });

  const TEMPLATE_TOKENS: Record<string, string> = {
    "#ffffff": "--color-background",
    "#0a0a0a": "--color-foreground",
    "#171717": "--color-primary",
    "#fafafa": "--color-primary-foreground",
    "#737373": "--color-muted-foreground",
    "#e5e5e5": "--color-border",
  };
  // 메일 CTA hover의 기존 고정값이다. 앱의 custom 토큰에 짝이 없고 메일의 리터럴 출력을 보존한다(Spec Y-a).
  const EXCEPTIONS = { "#262626": "CTA hover 전용; 대응하는 앱 custom 색 토큰 없음" };
  const template = `${INVITATION_EMAIL_HTML}\n${INVITATION_EMAIL_TILE_IMAGE}\n${INVITATION_EMAIL_TILE_FALLBACK}`;
  const hexes = (html: string): string[] => [...new Set([...html.matchAll(/(?<!&)#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi)].map((match) => match[0].toLowerCase()))].sort();
  const unpaired = (html: string): string[] => hexes(html).filter((hex) => !Object.hasOwn(TEMPLATE_TOKENS, hex) && !Object.hasOwn(EXCEPTIONS, hex));

  it("template의 리터럴 hex 전부가 실제 globals 토큰 값 또는 명시 예외다", () => {
    expect(hexes(template)).toEqual([...Object.keys(TEMPLATE_TOKENS), ...Object.keys(EXCEPTIONS)].sort());
    expect(unpaired(template)).toEqual([]);
    for (const [hex, token] of Object.entries(TEMPLATE_TOKENS)) expect(colorHex(token), token).toBe(hex);
  });

  it("#262626은 짝 없는 CTA hover 한 자리의 문서화된 예외다", () => {
    expect(Object.keys(EXCEPTIONS)).toEqual(["#262626"]);
    expect(EXCEPTIONS["#262626"]).not.toBe("");
    expect(template.match(/#262626/g)).toHaveLength(1);
    expect(template).toContain("a.mm-btn:hover{background:#262626!important}");
    // 알파 토큰(별칭 끝이 `color-mix(… transparent)`)은 불투명 `#262626`과 같을 수 없어 거른다 — color-scheme Phase 1의
    // `--color-success-soft`·`--color-warning-soft`(`-100/80`)다. 나머지 불투명 토큰은 전부 hex로 풀어 계속 센다.
    const terminal = (name: string): string => {
      const value = variables.get(name) ?? "";
      const alias = /^var\((--[\w-]+)\)$/.exec(value);
      return alias ? terminal(alias[1]!) : value;
    };
    const names = [...globals.matchAll(/^\s*(--color-[\w-]+):/gm)].map((match) => match[1]!);
    const translucent = names.filter((name) => /^color-mix\(/.test(terminal(name)));
    expect(translucent).toEqual(["--color-success-soft", "--color-warning-soft"]);
    const customColors = names.filter((name) => !translucent.includes(name)).map((name) => colorHex(name));
    expect(customColors).not.toContain("#262626");
  });

  it("HSL 환산과 미등재 hex 검출을 검증한다 (카나리아)", () => {
    expect(hslToHex(0, 0, 1)).toBe("#ffffff");
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hslToHex(-120, 1, 0.5)).toBe("#0000ff");
    expect(unpaired(template.replaceAll("#0a0a0a", "#010203"))).toEqual(["#010203"]);
  });

  it.each([
    "hsl(0 0% 100.%)", "hsl(--1 0% 100%)", "hsl(0 0% 1..0%)",
    "rgb(255. 255 255)", "rgb(2..55 255 255)", "oklch(100.% 0 none)",
    "hsl(NaN 0% 100%)", "rgb(Infinity 255 255)", "oklch(100% NaN none)",
    "hsl(1e999 0% 100%)", "rgb(1e999 255 255)", "oklch(100% 1e999 0)",
    "hsl(0 1e308% 1e308%)", "oklch(100% 1e308 0)",
  ])("실제 선언 파서가 잘못된 숫자나 비유한 채널을 거부한다: %s", (value) => {
    variables.set("--test-canary", value);
    try {
      expect(() => colorHex("--test-canary")).toThrow();
    } finally {
      variables.delete("--test-canary");
    }
  });

  it.each([
    ["hsl(-120 100% 50%)", "#0000ff"],
    ["rgb(+2.55e2 255 255)", "#ffffff"],
    ["oklch(100% 0 none)", "#ffffff"],
  ])("유효한 숫자와 zero-chroma none을 보존한다: %s", (value, hex) => {
    variables.set("--test-canary", value);
    try {
      expect(colorHex("--test-canary")).toBe(hex);
    } finally {
      variables.delete("--test-canary");
    }
  });

  it.each(["#f00", "#ffff", "#010203", "#010203ff", "#ffffff00"])("미등재 CSS hex를 길이에 관계없이 검출한다: %s", (hex) => {
    expect(unpaired(`${template}\n<style>.canary{color:${hex}}</style>`)).toEqual([hex]);
    expect(unpaired(template.replace("#ffffff", hex))).toEqual([hex]);
  });

  it("HTML 숫자 엔티티는 CSS 색이 아니다", () => {
    expect(hexes("&#8199;&#847;")).toEqual([]);
    expect(hexes("color:#AbC;background:#AbCd;fill:#AbCdEf;stroke:#AbCdEf01")).toEqual(["#abc", "#abcd", "#abcdef", "#abcdef01"]);
  });
});

/**
 * **self-hosted 메일의 원격 자산은 설치 origin이다** (self-hosting design §7). hosted는 프로덕션 고정(위 describe들)이지만,
 * self-hosted가 `mal-moi.com`의 로고·프록시를 가리키면 운영자 메일이 SaaS에서 이미지를 받고 그 서버엔 운영자 볼륨의 키가 없다.
 */
describe("buildInvitationEmail — self-hosted", () => {
  const ORIGIN = "https://malmoi.example.com";
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  function selfHosted() {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MALMOI_ORIGIN", ORIGIN);
  }
  const srcs = (html: string) => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1] ?? "");

  it.each([
    ["Blob URL", BLOB],
    ["상대 경로", "/api/images/projects/p_1/thumb-x.webp"],
  ])("썸네일(%s)·로고는 설치 origin의 경로이고 mal-moi.com이 0건이다", (_name, image) => {
    selfHosted();
    const { html, text } = buildInvitationEmail({ ...base, origin: ORIGIN, project: { ...project, image } });
    expect(text).toBe(`${ORIGIN}/invite/tok_abc-123`);
    expect(srcs(html)).toEqual([`${ORIGIN}/email/logo@2x.png`, `${ORIGIN}/api/images/email/projects/p_1/thumb-x.webp`]);
    expect(html).not.toContain("mal-moi.com");
  });

  it("폴백 Box도 설치 origin이다", () => {
    selfHosted();
    const { html } = buildInvitationEmail({ ...base, origin: ORIGIN, project: { ...project, image: null } });
    expect(srcs(html)).toEqual([`${ORIGIN}/email/logo@2x.png`, `${ORIGIN}/email/box@2x.png`]);
    expect(html).not.toContain("mal-moi.com");
  });

  it("hosted는 상대 경로 썸네일도 프로덕션 프록시로 싣는다 — 두 형태가 같은 키", () => {
    const { html } = buildInvitationEmail({ ...base, project: { ...project, image: "/api/images/projects/p_1/thumb-x.webp" } });
    expect(srcs(html)).toContain(PROXIED);
  });
});
