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

/**
 * ⚠️ **raw와 decode한 경로를 둘 다 본다** (Astra 교차 리뷰 🟡3, 선례 `isProtectedPath`) — `pathname`은 decode되지 않았지만 Next는 한 번
 * decode해 정적 파일을 찾으므로 `/%73itemap.xml`·`/llms%2etxt`도 크롤 파일이다. **decode가 실패하면 404다** — 무엇으로 풀릴지 모르는
 * 경로를 hosted 산출물일 수도 있는 채로 내보내지 않는다(`isProtectedPath`와 방향이 다르다: 그쪽은 보호 경로를 넓히지 않는 것이 안전하다).
 */
export function pageResponse(mode: DeploymentMode, pathname: string): { kind: "not-found" } | { kind: "pass"; noindex: boolean } {
  if (!hidden(mode)) return { kind: "pass", noindex: false };
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: "not-found" };
  }
  return CRAWL_FILES.has(pathname) || CRAWL_FILES.has(decoded) ? { kind: "not-found" } : { kind: "pass", noindex: true };
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
