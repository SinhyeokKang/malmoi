import type { ComponentType, SVGProps } from "react";

import type { LoginProvider } from "@/lib/login-link/policy";

/**
 * 브랜드 로고 셋 — provider 둘(8-1b) + MCP(2026-09-29) + GitLab(gitlab-repositories · 3색은 gitlab-oauth D6). ⚠️ **`GithubIcon`이 이 리포의 유일한 GitHub 글리프다** (2026-09-28 사용자) — 로그인 버튼뿐 아니라
 * 랜딩 CTA · 프로젝트 목록 · Sources 머리 · `/changelog`의 View on GitHub가 모두 이것을 쓴다. `components/sources/`의 옛 lucide 외곽선
 * 글리프와 두 벌이던 것을 합쳤다 — 늘리지 말고 여기서 가져다 쓴다(`components/__tests__/github-glyph.test.ts`가 소스에서 센다).
 *
 * ⚠️ **`components/ui/`가 아니다.** 그 디렉터리는 프리미티브의 집이고 브랜드 글리프는
 * 프리미티브가 아니다 — DESIGN §6.8이 *"provider 로고가 필요하면 인라인 SVG를 **그 컴포넌트
 * 안에** 둔다"*로 이미 답해 뒀다.
 *
 * ⚠️ **`lucide-react`에 브랜드 아이콘이 없다** — 그 라이브러리가 브랜드 글리프를 제외한다.
 *
 * ⚠️ **Google의 4색과 GitLab 3색(`GitlabBrandIcon`)은 DESIGN §6.2 "새 raw 색을 늘리지 않는다"의 예외다.** 브랜드 색은 우리가
 * 고르는 값이 아니라 남의 자산이라 토큰으로 접을 수 없다. 같은 이유로 §6.8의 *"색은 상속
 * (`currentColor`)"*도 여기서만 깨진다.
 */

/** 단색 — `currentColor`라 버튼 variant를 따라간다. */
export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.3 0 .32.21.7.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

/**
 * **공식 Model Context Protocol 로고** (2026-09-29 사용자 — MCP를 뜻하던 lucide `Plug`를 대신한다. `/mcp` 사이드바·사용자 메뉴 항목과
 * 토큰 카드 빈 상태가 쓴다 — `components/__tests__/mcp-glyph.test.ts`가 소스에서 센다).
 * 출처: simple-icons 16.33.0 `icons/modelcontextprotocol.svg` — 데이터 라이선스 **CC0-1.0**, 원본은
 * `github.com/modelcontextprotocol/docs` `logo/light.svg`(simple-icons `source` 필드). 로고는 상표라 **모양을 바꾸지 않는다**.
 *
 * ⚠️ **채운 글리프다 — lucide(선 2)가 아니다.** 선 폭이 24 박스에서 약 0.84라 같은 16 크기에서 이웃 lucide 글리프보다 **가늘게** 보인다
 * (무거워 보이지 않는다). 크기만 호출부의 `size-*`를 따르고 path는 손대지 않는다.
 */
export function McpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
    </svg>
  );
}

/**
 * **GitLab tanuki** (gitlab-repositories D10 — 리포 호스트 GitLab을 가리키는 자리가 쓴다. `components/__tests__/gitlab-glyph.test.ts`가 소스에서 센다).
 * 출처: simple-icons 16.33.0 `icons/gitlab.svg` — 데이터 라이선스 **CC0-1.0**. 로고는 상표라 **모양을 바꾸지 않는다**.
 *
 * ⚠️ **단색 `currentColor`다 — 공식 주황 셋이 아니다.** 옆에 서는 `GithubIcon`과 같은 형이고, 다색이면 DESIGN §6.2 raw 색 예외를
 * 늘려야 한다(공식 3색은 `GitlabBrandIcon`이 예외로 든다). `visual-system.test.ts`는 이 파일을 면제하므로 색 리터럴 0은 `gitlab-glyph.test.ts`가 센다.
 * **인라인 자리**(텍스트 옆 `size-3.5` — 프로젝트 목록·소스·홈 메타·새 프로젝트 탭) 전용이다. 로그인 버튼·카드 칸은 `GitlabBrandIcon`(D6).
 */
export function GitlabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z" />
    </svg>
  );
}

/** 공식 G — path별 브랜드 hex다. `currentColor`로 접으면 로고가 아니게 된다. */
export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" {...props}>
      <path d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" fill="#4285F4" />
      <path d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.28v3.11A12 12 0 0 0 12 24z" fill="#34A853" />
      <path d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.28a12 12 0 0 0 0 10.76l4-3.11z" fill="#FBBC05" />
      <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.28 6.62l4 3.11C6.22 6.89 8.87 4.75 12 4.75z" fill="#EA4335" />
    </svg>
  );
}

/**
 * **공식 3색 tanuki** (gitlab-oauth D6 — 로그인 버튼과 카드 칸의 GitLab. 인라인 자리는 단색 `GitlabIcon` 그대로다).
 * 출처: GitLab press kit `https://about.gitlab.com/images/press/gitlab-logo-500-rgb.svg`(2026-10-13 취득, sha256
 * `d8522f9bb83b35bcf0ab6e7fc25a312c26120028af308bec1dd9d20e15c1a615`) — path·색은 원본 그대로이고 원본의 380 여백 상자만
 * `viewBox`로 tanuki 둘레에 맞췄다. 사용 조건: GitLab Trademark Guidelines(handbook.gitlab.com …/trademark-guidelines) — GitLab을
 * 가리키는 지명적 사용이고 로고는 상표라 **모양·색을 바꾸지 않는다**.
 *
 * ⚠️ **색 리터럴 셋은 DESIGN §6.2 raw 색 예외다**(Google 4색과 같은 근거). `currentColor`로 접으면 칸의 상태 색(`tone`)을 받아
 * 로고가 아니게 된다 — `gitlab-glyph.test.ts`가 색 집합을 정확히 센다.
 */
export function GitlabBrandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="112 112 156 156" aria-hidden focusable="false" {...props}>
      <path d="M265.26416,174.37243l-.2134-.55822-21.19899-55.30908c-.4236-1.08359-1.18542-1.99642-2.17699-2.62689-.98837-.63373-2.14749-.93253-3.32305-.87014-1.1689.06239-2.29195.48925-3.20809,1.21821-.90957.73554-1.56629,1.73047-1.87493,2.85346l-14.31327,43.80662h-57.90965l-14.31327-43.80662c-.30864-1.12299-.96536-2.11791-1.87493-2.85346-.91614-.72895-2.03911-1.15582-3.20809-1.21821-1.17548-.06239-2.33468.23641-3.32297.87014-.99166.63047-1.75348,1.5433-2.17707,2.62689l-21.19891,55.31237-.21348.55493c-6.28158,16.38521-.92929,34.90803,13.05891,45.48782.02621.01641.04922.03611.07552.05582l.18719.14119,32.29094,24.17392,15.97151,12.09024,9.71951,7.34871c2.34117,1.77316,5.57877,1.77316,7.92002,0l9.71943-7.34871,15.96822-12.09024,32.48142-24.31511c.02958-.02299.05588-.04269.08538-.06568,13.97834-10.57977,19.32735-29.09604,13.04905-45.47796Z" fill="#E24329" />
      <path d="M265.26416,174.37243l-.2134-.55822c-10.5174,2.16062-20.20405,6.6099-28.49844,12.81593-.1346.0985-25.20497,19.05805-46.55171,35.19699,15.84998,11.98517,29.6477,22.40405,29.6477,22.40405l32.48142-24.31511c.02958-.02299.05588-.04269.08538-.06568,13.97834-10.57977,19.32735-29.09604,13.04905-45.47796Z" fill="#FC6D26" />
      <path d="M160.34962,244.23117l15.97151,12.09024,9.71951,7.34871c2.34117,1.77316,5.57877,1.77316,7.92002,0l9.71943-7.34871,15.96822-12.09024s-13.79772-10.41888-29.6477-22.40405c-15.85327,11.98517-29.65099,22.40405-29.65099,22.40405Z" fill="#FCA326" />
      <path d="M143.44561,186.63014c-8.29111-6.20274-17.97446-10.65531-28.49507-12.81264l-.21348.55493c-6.28158,16.38521-.92929,34.90803,13.05891,45.48782.02621.01641.04922.03611.07552.05582l.18719.14119,32.29094,24.17392s13.79772-10.41888,29.65099-22.40405c-21.34673-16.13894-46.42031-35.09848-46.55499-35.19699Z" fill="#FC6D26" />
    </svg>
  );
}

/**
 * **공급자 → 글리프 대응은 이 표 하나다** (gitlab-oauth design §5) — 로그인 버튼 셋·`/account` 수단 행·`/signin/link` 배지가 2갈래 삼항
 * (`github ? … : google`)을 손으로 들던 것을 모았다. 셋째 갈래가 삼항에 빠지면 GitLab이 Google 글리프로 떨어진다 —
 * `provider-universe.test.ts`가 이 파일 밖의 `GoogleIcon` 참조를 센다.
 */
const PROVIDER_GLYPH: Readonly<Record<LoginProvider, ComponentType<SVGProps<SVGSVGElement>>>> = {
  github: GithubIcon,
  gitlab: GitlabBrandIcon,
  google: GoogleIcon,
};

/** 로그인 버튼의 공급자 글리프 — GitHub는 버튼 글자색을 상속한다(primary 채움 위 흰색 · default 위 잉크, D6). */
export function ProviderIcon({ provider, ...props }: SVGProps<SVGSVGElement> & { provider: LoginProvider }) {
  const Glyph = PROVIDER_GLYPH[provider];
  return <Glyph {...props} />;
}

/**
 * **카드 칸(`IconTile`)의 브랜드 글리프** (gitlab-oauth D6) — `/account` 수단 행·GitHub App 카드·GitLab PAT 카드·설정 리포 카드·`/signin/link` 배지.
 *
 * ⚠️ **`text-foreground`가 칸의 색 상속을 끊는다.** `IconTile`은 글자색으로 회색(`muted`)이나 상태 색(`tone`)을 싣고, 단색 GitHub는 그것을
 * `currentColor`로 받아 회색·호박색 로고가 됐다. 잉크(라이트 검정 · 다크 흰색)는 테마 토큰이라 새 raw 색이 아니다. GitLab·Google은 path
 * `fill`이 hex라 이 클래스와 무관하다. **`tone`은 칸의 면만 칠한다**(DESIGN §2.4).
 */
export function BrandGlyph({ brand }: { brand: LoginProvider }) {
  return <ProviderIcon provider={brand} className="size-4 text-foreground" />;
}
