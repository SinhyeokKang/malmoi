import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { toneOf, TONES, type Tone } from "@/lib/tone";

import { INVITATION_EMAIL_LOGO_URL, INVITATION_EMAIL_SUBJECT, TONE_HEX, buildInvitationEmail, emailProjectName } from "../message";

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
    expect(html).toContain("You've been invited to join this project on Malmoi.");
    expect(html).not.toContain("Someone has");
    expect(html).not.toContain("Accept the invitation to get started.");
  });

  it("카드가 문장과 버튼 사이에 선다 — 폭 100%, 테두리 #e5e5e5, radius 12", () => {
    const { html } = buildInvitationEmail(base);
    const sentence = html.indexOf("You've been invited to join this project");
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
    const hex = TONE_HEX[toneOf(project.name)];
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
      if (toneOf(candidate) !== toneOf(emailProjectName(candidate))) {
        name = candidate;
        break;
      }
    }
    expect(name).not.toBe("");
    const { html } = buildInvitationEmail({ ...base, project: { name, image: null } });
    expect(html).toContain(`bgcolor="${TONE_HEX[toneOf(name)]}"`);
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
describe("TONE_HEX", () => {
  const css = readFileSync("node_modules/tailwindcss/theme.css", "utf8");

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

  function expected(tone: Tone): string {
    const match = new RegExp(`--color-${tone}-600:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(css);
    if (!match) throw new Error(`theme.css에 --color-${tone}-600이 없다`);
    return oklchToHex(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
  }

  it("톤 여덟 전부가 theme.css -600의 sRGB clamp 환산값과 같다", () => {
    expect(Object.keys(TONE_HEX).sort()).toEqual([...TONES].sort());
    for (const tone of TONES) expect(TONE_HEX[tone], tone).toBe(expected(tone));
  });

  it("환산 자체가 설계 표와 맞는다 — 환산식이 틀리면 둘 다 같이 틀리는 것을 막는다", () => {
    expect(expected("rose")).toBe("#ec003f");
    expect(expected("indigo")).toBe("#4f39f6");
  });
});
