/**
 * 요청 origin 판정 (malmoi#7). **`redirect_uri`와 state 쿠키의 `secure`가 같은 판정에서 나온다.**
 *
 * ⚠️ **`redirect_uri`를 안 보내면 GitHub이 App에 등록된 첫 callback URL을 쓴다.** 우리 App은 셋을
 * 등록했으므로(localhost · preview · 프로덕션) **로컬에서 시작한 연결이 프로덕션으로 돌아갔다**
 * (T5 실측 → malmoi#7). state 쿠키는 시작한 origin에 있으니 그 왕복은 영원히 `state-mismatch`이고,
 * 증상이 "쿠키가 없다"라서 서명을 의심하게 만든다.
 *
 * ⚠️ **둘을 따로 판정하지 않는 것이 이 파일의 요지다.** origin은 `Host`에서, `secure`는
 * `x-forwarded-proto`에서 각자 읽으면 한쪽만 바뀌어도 쿠키를 심은 이름과 찾는 이름이 갈린다 —
 * `stateCookieNames`가 그 갈림을 이미 한 번 감당하고 있고(design §3.1), 그 위에 또 쌓지 않는다.
 */

/** App 설정에 등록한 경로. 세 환경이 전부 `<origin>` + 이 값이다 — 바뀌면 셋이 함께 죽는다. */
const CALLBACK_PATH = "/api/github/callback";

/**
 * ⚠️ `Host`는 클라이언트가 조작할 수 있다. 조작된 값으로 authorize URL을 만들어도 GitHub이 등록된
 * callback과 대조해 거부하므로 유출 경로는 아니지만, 그때 실패 원인이 우리 코드가 아니라 GitHub
 * 오류로 보인다. **호스트 모양이 아니면 아예 만들지 않는다.**
 */
const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

/**
 * **기대 호스트 허용 목록** (2026-09-09, sec-audit 발견 25). 모양 검사만으로는 `evil.com`도 통과한다.
 *
 * ⚠️ **실측으로는 플랫폼이 이미 막는다** (2026-09-09 프로덕션): `Host: evil.com`은 Vercel 엣지가
 * 404 `DEPLOYMENT_NOT_FOUND`로 끊고 `X-Forwarded-Host`는 앱 출력에 반영되지 않는다. **그래도 여기에
 * 두는 이유는 그 방어가 우리 코드의 성질이 아니기 때문이다** — 플랫폼 설정이 바뀌면 조용히 사라진다.
 *
 * ⚠️ **preview는 dev 고정 URL 하나다.** OAuth App이 callback을 하나만 갖고 배포별 URL은 매번 바뀌므로,
 * 애초에 그 URL에서만 연결이 성립한다 (CLAUDE.md 브랜치·배포 절). 목록을 늘릴 일이 생기면 그 절과
 * GitHub App 설정이 **함께** 바뀌어야 한다.
 */
const ALLOWED_HOSTS: readonly string[] = [
  "mal-moi.com",
  "malmoi-git-dev-ox501501-1046s-projects.vercel.app",
];
/** 로컬 개발 — 포트는 고정하지 않는다(3000이 잡혀 있으면 Next가 다음 포트로 뜬다). */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowed(host: string): boolean {
  return ALLOWED_HOSTS.includes(host.toLowerCase()) || LOCAL_HOST.test(host);
}

export function requestOrigin(input: {
  host: string | null | undefined;
  forwardedProto: string | null | undefined;
}): { origin: string; secure: boolean } | null {
  const host = input.host ?? "";
  if (host === "" || !HOST.test(host)) return null;
  // 모양이 맞아도 우리 호스트가 아니면 origin을 만들지 않는다 — 이 값이 `redirect_uri`가 된다.
  if (!allowed(host)) return null;

  // 프록시가 둘 이상이면 `https,http`처럼 목록으로 온다 — 뒤를 보면 판정이 뒤집힌다.
  const proto = (input.forwardedProto ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const secure = proto === "https";

  return { origin: `${secure ? "https" : "http"}://${host}`, secure };
}

export function callbackUrl(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}
