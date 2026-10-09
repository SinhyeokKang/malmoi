import type { DeploymentMode } from "@/lib/deployment/mode";

/**
 * **공개 응답 정책 — 배포 모드 하나로 색인·집계·방침의 출처를 가른다** (self-hosting design §7·§9). hosted는 무변경이다.
 *
 * self-hosted가 hosted 산출물을 내면 거짓이다 — sitemap·llms는 `SITE_ORIGIN`(hosted)을 가리키는 정적 파일이고, Vercel 집계는 그 설치에
 * 없으며, `/privacy` 본문은 hosted 운영자의 방침이다. 그래서 페이지는 noindex, 세 크롤 파일은 404, 집계는 끄고, 방침은 운영자 URL로 보낸다.
 * canonical·JSON-LD의 `SITE_ORIGIN`은 noindex 아래라 무해해서 바꾸지 않는다. 이것은 보안 기능이 아니다.
 *
 * ⚠️ **무효 모드는 self-hosted처럼 숨긴다** — 설정이 틀린 설치가 hosted 것을 자기 것인 양 내지 않는다(`robotsFor`의 "모르면 숨긴다"와 같은 방향).
 *
 * ⚠️ **import가 타입 하나뿐인 잎이다** — middleware(Edge)가 부른다.
 */

/** `app/sitemap.ts`·`app/llms.txt`·`app/llms-full.txt`의 경로 — 셋 다 middleware matcher 안에 있다. */
const CRAWL_FILES: ReadonlySet<string> = new Set(["/sitemap.xml", "/llms.txt", "/llms-full.txt"]);

const hidden = (mode: DeploymentMode) => mode.kind !== "hosted";

export function pageResponse(mode: DeploymentMode, pathname: string): { kind: "not-found" } | { kind: "pass"; noindex: boolean } {
  if (!hidden(mode)) return { kind: "pass", noindex: false };
  return CRAWL_FILES.has(pathname) ? { kind: "not-found" } : { kind: "pass", noindex: true };
}

/** ⚠️ 서버 레이아웃에서만 부른다 — 클라이언트에서는 env가 비어 늘 hosted로 읽힌다. */
export function analyticsEnabled(mode: DeploymentMode): boolean {
  return !hidden(mode);
}

/**
 * `/privacy`의 갈래. 운영자 URL의 형식·순환은 preflight가 이미 거부했으므로 여기서는 고르기만 한다. 비었으면 hosted 방침을 대신 그리지 않는다.
 */
export function privacyDestination(
  mode: DeploymentMode,
  privacyUrl: string | undefined,
): { kind: "render" } | { kind: "redirect"; url: string } | { kind: "unavailable" } {
  if (mode.kind === "hosted") return { kind: "render" };
  return mode.kind === "self-hosted" && privacyUrl !== undefined ? { kind: "redirect", url: privacyUrl } : { kind: "unavailable" };
}

/**
 * 동의문(`/signin`·`/oauth/authorize`)의 방침 링크. self-hosted에서는 운영자 페이지로 나가므로 새 탭이다 — 진행 중인 로그인·동의 흐름에서
 * 같은 탭을 떠나면 돌아올 길이 끊긴다(POSTMORTEM 2026-09-12, DESIGN §6.3).
 */
export function consentLinkProps(mode: DeploymentMode): { target?: "_blank"; rel?: string } {
  return hidden(mode) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
