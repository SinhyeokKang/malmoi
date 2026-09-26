/**
 * **보안 응답 헤더의 값** (sec-audit 발견 9 → 2026-09-24 audit #75 → sec-audit-3 #11). CSP는 `middleware.ts`가
 * 요청마다(nonce), 나머지 넷은 `next.config.ts`의 `headers()`가 정적으로 낸다.
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
 * 요청마다 새 script nonce — 16바이트 base64. Web Crypto만 쓴다(미들웨어가 어느 런타임에서 돌든 같다).
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Next가 요청 CSP에서 nonce를 뽑는 모양과 같다(`get-script-nonce-from-header`) — 어긋나면 조용히 nonce 없이 렌더한다. */
const NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * **enforce 정책** (2026-09-24 — 2026-09-09의 "Report-Only로 시작"을 뒤집었다, 사용자 판정 "보안 강하게").
 *
 * **script는 nonce다** (sec-audit-3 #11 — 결정 B). Next가 요청 CSP의 nonce를 자기 부트스트랩(`self.__next_f.push`)과
 * 청크 `<script>`에 붙이고, `'strict-dynamic'`이 그 스크립트가 불러오는 청크로 신뢰를 잇는다 — 주입된 인라인 스크립트는
 * nonce를 모르니 막힌다. ⚠️ **대가는 전 페이지 동적 렌더다**(`app/layout.tsx`의 `connection()`).
 *
 * ⚠️ **`style-src`에는 `'unsafe-inline'`이 남는다** — React `style` 속성·sonner·radix가 인라인 스타일을 쓰고 nonce는
 * 속성에 안 붙는다(ARCHITECTURE §8 잔여).
 */
export function buildCsp(env: CspEnvironment, options: { nonce: string; blobHost: string | undefined }): string {
  // 정책 문자열에 그대로 이어 붙으므로 따옴표·`;`가 새면 지시어를 주입한다 — 호출자가 `createNonce`여도 여기서 막는다.
  if (!NONCE.test(options.nonce)) throw new Error("buildCsp: malformed nonce");
  // ⚠️ 모양이 틀린 값은 없는 것으로 친다 — 없으면 업로드 이미지가 안 보일 뿐이고(fail-closed), 남의 스토어는 안 열린다.
  const blob = options.blobHost !== undefined && isBlobPublicHost(options.blobHost) ? [`https://${options.blobHost}`] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // Next는 스타일을 인라인으로 넣는다.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // `'self'`는 `'strict-dynamic'`을 모르는 옛 브라우저용이다(CSP3 브라우저는 무시한다). React가 dev에서 eval을 쓴다.
    ["script-src", ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(env === "development" ? ["'unsafe-eval'"] : [])]],
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

/**
 * **CSP를 뺀 넷** — 경로와 무관한 정적 값이라 `next.config.ts`가 `/(.*)` 전부(API·정적 자산 포함)에 싣는다.
 * ⚠️ **CSP는 하나만** 보낸다 — 둘이면 브라우저가 교집합을 적용해 한쪽 완화가 조용히 무시된다. 그 하나는 미들웨어다.
 */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    /**
     * ⚠️ **실질이 가장 큰 헤더다.** `/invite/<token>`은 토큰이 **URL에** 있어, 그 화면에 외부 링크가 하나
     * 추가되는 순간 토큰이 `Referer`로 나간다.
     */
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
