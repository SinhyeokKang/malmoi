/**
 * **보안 응답 헤더의 값** (sec-audit 발견 9 → 2026-09-24 audit #75). `next.config.ts`의 `headers()`가 부른다.
 *
 * ⚠️ **잎이다 — import 0.** next.config가 빌드·기동 시점에 이 파일을 읽으므로 경로 별칭·서버 모듈을 물면
 * 설정 로드가 죽는다. 환경은 호출자가 넘긴다(모듈 최상위에서 env를 읽지 않는다 — CLAUDE.md 코드 컨벤션).
 */

export type CspEnvironment = "production" | "preview" | "development";

/**
 * `next dev`가 VERCEL_ENV보다 앞이다. 그 밖에서 `preview`가 아니면 전부 프로덕션이다 — **모르는 값은 가장 좁은
 * 정책으로 접는다**(자체 호스팅·로컬 `pnpm start`도 프로덕션 정책을 받는다).
 */
export function cspEnvironment(input: { nodeEnv: string | undefined; vercelEnv: string | undefined }): CspEnvironment {
  if (input.nodeEnv === "development") return "development";
  if (input.vercelEnv === "preview") return "preview";
  return "production";
}

/**
 * Vercel Toolbar(preview 전용)가 요구하는 호스트 — 출처는 Vercel 문서 "Using a Content Security Policy"
 * (https://vercel.com/docs/vercel-toolbar/managing-toolbar#using-a-content-security-policy, 2026-08-11 갱신본).
 * 문서가 바뀌면 여기를 같이 고친다.
 */
const TOOLBAR: Readonly<Record<string, readonly string[]>> = {
  "script-src": ["https://vercel.live"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "img-src": ["https://vercel.live", "https://vercel.com", "blob:"],
  "frame-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
};

/**
 * **Vercel Blob 공개 호스트 하나의 모양** (sec-audit-3 #12). 이 값이 CSP 문자열에 그대로 이어 붙으므로 `;`·공백·
 * 와일드카드가 새면 지시어를 주입하게 된다 — 스토어 id 한 라벨만 받는다.
 */
const BLOB_PUBLIC_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

export function isBlobPublicHost(host: string): boolean {
  return BLOB_PUBLIC_HOST.test(host);
}

/**
 * **enforce 정책** (2026-09-24 — 2026-09-09의 "Report-Only로 시작"을 뒤집었다, 사용자 판정 "보안 강하게").
 *
 * ⚠️ **`'unsafe-inline'`이 script·style에 남는다** — Next는 인라인 부트스트랩(`self.__next_f.push`)과 인라인
 * 스타일을 넣고, 이 리포엔 nonce 배선이 없다. nonce로 가면 모든 페이지가 요청마다 렌더돼야 해서 범위 밖이다.
 * 그래서 이 정책이 막는 것은 **외부 출처**의 스크립트·연결·폼 전송·플러그인·`<base>` 탈취다.
 */
export function buildCsp(env: CspEnvironment, options: { blobHost: string | undefined }): string {
  // ⚠️ 모양이 틀린 값은 없는 것으로 친다 — 없으면 업로드 이미지가 안 보일 뿐이고(fail-closed), 남의 스토어는 안 열린다.
  const blob = options.blobHost !== undefined && isBlobPublicHost(options.blobHost) ? [`https://${options.blobHost}`] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // Next는 스타일을 인라인으로 넣는다.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // React Refresh가 eval을 쓴다 — `next dev` 전용이다.
    ["script-src", ["'self'", "'unsafe-inline'", ...(env === "development" ? ["'unsafe-eval'"] : [])]],
    // 폰트는 자사 호스트다 (`public/fonts/` — CLAUDE.md 폰트 절).
    ["font-src", ["'self'"]],
    // 공급자 아바타 둘 + 업로드한 프로필·프로젝트 이미지(Vercel Blob 공개 읽기). ⚠️ Blob은 **이 환경의 스토어 하나**다 —
    // `*.public.blob.vercel-storage.com`은 아무 Vercel 고객의 공개 스토어를 열었다(sec-audit-3 #12).
    ["img-src", ["'self'", "data:", "https://avatars.githubusercontent.com", "https://lh3.googleusercontent.com", ...blob]],
    // HMR 웹소켓 — Safari는 `'self'`를 ws로 넓히지 않는다.
    ["connect-src", ["'self'", ...(env === "development" ? ["ws:", "wss:"] : [])]],
    // ⚠️ `form-action`은 폼 제출 뒤의 302에도 걸린다 — GitHub(OAuth·App 설치)과 Google 로그인
    // (POST → `accounts.google.com`)이 빠지면 그 로그인만 조용히 멈춘다.
    ["form-action", ["'self'", "https://github.com", "https://accounts.google.com"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    // `<meta>`로 표현할 수 없는 지시어라 헤더가 유일한 자리다. 우리 화면은 iframe에 들어가지 않는다.
    ["frame-ancestors", ["'none'"]],
  ];
  if (env === "preview") {
    directives.push(["frame-src", ["'self'"]]);
    for (const entry of directives) {
      const extra = TOOLBAR[entry[0]];
      if (extra) entry[1] = [...entry[1], ...extra];
    }
  }
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

export function securityHeaders(env: CspEnvironment, options: { blobHost: string | undefined }): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    /**
     * ⚠️ **실질이 가장 큰 헤더다.** `/invite/<token>`은 토큰이 **URL에** 있어, 그 화면에 외부 링크가 하나
     * 추가되는 순간 토큰이 `Referer`로 나간다.
     */
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    /** CSP는 **하나만** 보낸다 — 둘이면 브라우저가 교집합을 적용해 한쪽 완화가 조용히 무시된다. */
    { key: "Content-Security-Policy", value: buildCsp(env, options) },
    /**
     * ⚠️ **`includeSubDomains`가 `*.mal-moi.com` 전부를 HTTPS에 묶는다**(`dev.mal-moi.com` 포함) — http로만 뜨는
     * 하위 호스트를 만들 수 없게 된다. **`preload`는 선언일 뿐이고 hstspreload.org 제출은 사람의 몫이다**
     * (되돌리는 데 수개월 — docs/OPERATIONS.md). http인 로컬은 브라우저가 이 헤더를 무시한다.
     */
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    // 쓰지 않는 강력 기능을 끈다 — 업로드는 파일 입력이라 대상이 아니다.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  ];
}
