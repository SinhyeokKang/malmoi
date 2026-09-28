import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { toneOf, type Tone } from "@/lib/tone";
import { planProjectImageDelete } from "@/lib/upload/image";

import { INVITATION_EMAIL_HTML, INVITATION_EMAIL_TILE_FALLBACK, INVITATION_EMAIL_TILE_IMAGE } from "./template";

/**
 * 개인별 초대 메일 (design §4 · invitation-email-project). **text는 초대 URL 한 줄이고, html은 링크와 프로젝트
 * 카드(썸네일·이름·역할)를 싣는다.** 제목·preheader·text에는 이름·역할을 넣지 않는다 — 받은편지함 목록에
 * OWNER 자유 문구가 서지 않게. 초대한 사람·추적은 여전히 없다. 수신자는 언제나 한 명이라 배치 안에서도 다른
 * 사람의 주소·링크가 섞이지 않는다.
 */

export const INVITATION_EMAIL_SUBJECT = "You're invited to a project on Malmoi";
/**
 * ⚠️ **프로덕션 고정 URL이다** — dev·로컬 메일도 이 주소를 쓴다. preview 호스트는 Vercel SSO 뒤라 메일
 * 클라이언트가 이미지를 못 받는다. 파일이 프로덕션에 배포되기 전에는 alt 텍스트가 워드마크 자리를 채운다.
 */
export const INVITATION_EMAIL_LOGO_URL = "https://mal-moi.com/email/logo@2x.png";
/** 폴백 타일의 흰 Box 글리프. 로고와 같은 이유로 프로덕션 고정이다 — 경로를 옮기면 이미 보낸 메일이 깨진다. */
const BOX_URL = "https://mal-moi.com/email/box@2x.png";
/**
 * ⚠️ **Blob 호스트를 수신 측에 주지 않는다**(ARCHITECTURE §6.7) — 사내 웹필터가 `*.vercel-storage.com`을 막아
 * 이미지를 직접 받는 메일 클라이언트도 같이 막힌다. 로고와 같이 프로덕션 고정이라 dev 스토어 키는 404(빈 칸)다.
 */
const IMAGE_PROXY_ORIGIN = "https://mal-moi.com";

/**
 * 톤 → 폴백 셀 hex. 판정은 화면과 같은 `toneOf`이고 값만 hex다 — 메일 클라이언트는 oklch를 못 읽는다.
 * 값은 Tailwind v4 `--color-<tone>-600` oklch를 sRGB로 환산해 채널별 clamp한 것이고 `message.test.ts`가
 * `theme.css`에서 다시 환산해 대조한다(P3 화면의 앱 쪽 채도가 더 높은 잔여 차이는 수용).
 */
export const TONE_HEX: Record<Tone, string> = {
  rose: "#ec003f",
  orange: "#f54900",
  amber: "#e17100",
  emerald: "#009966",
  teal: "#009689",
  sky: "#0084d1",
  indigo: "#4f39f6",
  fuchsia: "#c800de",
};

const NAME_MAX_GRAPHEMES = 60;

/**
 * 메일 카드의 프로젝트 이름 — grapheme 60개 초과면 앞 59개 + `…`. 상한은 줄 수가 아니라 **피싱 무게**다
 * (OWNER 자유 입력이 문장처럼 읽히지 않게). 코드 포인트로 자르면 ZWJ 이모지·국기 쌍·결합 문자가 깨진다.
 * ⚠️ 이스케이프하지 않는다 — 이스케이프 뒤에 자르면 `&amp;`가 중간에서 잘린다.
 */
export function emailProjectName(name: string): string {
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(name)];
  if (graphemes.length <= NAME_MAX_GRAPHEMES) return name;
  return `${graphemes
    .slice(0, NAME_MAX_GRAPHEMES - 1)
    .map((g) => g.segment)
    .join("")}…`;
}

export type InvitationEmail = { from: string; to: [string]; subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildInvitationEmail(input: {
  from: string;
  origin: string;
  to: string;
  token: string;
  project: { name: string; image: string | null };
  role: Role;
}): InvitationEmail {
  const url = `${input.origin}${routes.invite(input.token)}`;
  // 키가 안 나오는 값(null·""·남의 URL)은 전부 폴백으로 간다 — 화면 `useImageFallback`의 "매핑 뒤 falsy면 폴백"과 같은 판정.
  const key = planProjectImageDelete(input.project.image);
  const values: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
    LOGO_URL: INVITATION_EMAIL_LOGO_URL,
    INVITE_URL: escapeHtml(url),
    PROJECT_NAME: escapeHtml(emailProjectName(input.project.name)),
    ROLE: escapeHtml(m.projects.role[input.role]),
    TILE: key === null ? INVITATION_EMAIL_TILE_FALLBACK : INVITATION_EMAIL_TILE_IMAGE,
    TILE_SRC: key === null ? BOX_URL : escapeHtml(`${IMAGE_PROXY_ORIGIN}/api/images/${key}`),
    // 톤은 자르기 전 원래 이름으로 고른다 — 잘린 이름으로 고르면 화면 타일과 색이 갈린다.
    TILE_BG: TONE_HEX[toneOf(input.project.name)],
  });
  return {
    from: input.from,
    to: [input.to],
    subject: INVITATION_EMAIL_SUBJECT,
    text: url,
    html: fill(INVITATION_EMAIL_HTML, values),
  };
}

/**
 * ⚠️ **사용자 값은 정확히 한 번만 치환된다.** 연쇄 `replaceAll`이면 `{{INVITE_URL}}`이 든 프로젝트 이름이 뒤
 * 치환에서 다시 전개된다(`escapeHtml`은 `{`·`}`를 안 건드린다). 치환 결과는 다시 훑지 않으므로 사용자 값 안의
 * `{{…}}`는 문자 그대로 남는다. 다시 채우는 것은 `{{TILE}}` 하나뿐이다 — 그 값은 우리 상수 조각이고 조각 안
 * 변수의 값도 상수 URL · allowlist를 지난 키 · hex뿐이다. 값을 함수로 돌려줘 `$&` 패턴도 해석되지 않는다.
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (!Object.hasOwn(values, name)) return match;
    const value = values[name] ?? match;
    return name === "TILE" ? fill(value, values) : value;
  });
}
