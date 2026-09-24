import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leave multipart overhead above the 3 MB image limit.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // 타입·린트 오류를 빌드가 삼키지 않게 둔다(기본값이지만 명시). 게이트는 pnpm typecheck다.
  typescript: { ignoreBuildErrors: false },

  /**
   * ⚠️ Next가 `AGENTS.md`에 자기 블록을 덧붙이는 동작을 끈다.
   *
   * 이 리포의 `AGENTS.md`는 **`scripts/sync-agents.mjs`가 소유하는 Codex 미러**다
   * (`CLAUDE.md` + `.agents/PREAMBLE.md`의 순수 생성물). Next가 덧붙이면 `next dev`를 돌릴
   * 때마다 미러 게이트(`pnpm sync:agents:check`)가 드리프트로 잡고, 지우면 Next가 다시 만든다.
   */
  agentRules: false,

  /**
   * **보안 응답 헤더** (2026-09-09, sec-audit 발견 9). 전에는 세 파일 어디에도 없었다.
   *
   * ⚠️ **`tsc`는 이 함수의 형태를 못 본다** — 없어도, 헤더 이름에 오타가 나도 타입은 통과한다.
   * `app/__tests__/security-headers.test.ts`가 설정을 **불러서** 검사하는 이유다.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          /**
           * ⚠️ **이 셋 중 실질이 가장 크다.** `/invite/<token>`은 토큰이 **URL에** 있어, 그 화면에
           * 외부 링크가 하나 추가되는 순간 토큰이 `Referer`로 나간다. 지금 외부 링크가 0개인 것을
           * 지키는 가드는 없었다.
           */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /**
           * ⚠️ **enforce 쪽에는 `frame-ancestors`만 둔다.** 이 지시어는 `<meta>`로 표현할 수 없어
           * 헤더가 유일한 자리이고, 깨질 여지가 없다(우리 화면은 iframe에 들어가지 않는다).
           * `default-src`를 여기 섞으면 아래 Report-Only가 무의미해진다 — 그게 곧 enforce다.
           */
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          /**
           * HTTPS 고정 (audit #75). http인 로컬은 브라우저가 이 헤더를 무시한다.
           * ⚠️ **`includeSubDomains`·`preload`를 붙이지 않는다** — preload 목록에 박히면 되돌리는 데 수개월이
           * 걸리고, 하위 도메인까지 묶는 것은 도메인 운영 판단이다. 필요해지면 그때 따로 정한다.
           */
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // 쓰지 않는 강력 기능을 끈다 — 우리 화면은 이 중 무엇도 부르지 않는다(업로드는 파일 입력이라 대상이 아니다).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          /**
           * **CSP 본체는 Report-Only로 시작한다** (2026-09-09 판정). Next가 인라인 스타일·스크립트를
           * 넣으므로 enforce를 바로 켜면 화면이 깨질 수 있고 **깨지는 방식이 조용하다**(콘솔에만 난다).
           * 이 리포엔 렌더 테스트가 없어 `pnpm build`로도 못 본다.
           *
           * ⚠️ **`report-uri`를 안 붙인다** — 받을 엔드포인트가 없다. 지금 이 헤더가 하는 일은
           * 브라우저 콘솔에 위반을 남기는 것뿐이고, enforce로 올리기 전에 그것을 읽는 것이 순서다.
           */
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // Next는 스타일을 인라인으로 넣는다 — enforce로 올릴 때 가장 먼저 걸릴 자리다.
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              // 폰트는 자사 호스트다 (`public/fonts/` — CLAUDE.md 폰트 절).
              "font-src 'self'",
              "img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://*.public.blob.vercel-storage.com",
              // GitHub 왕복은 브라우저 이동(navigation)이라 `connect-src`가 아니라 `form-action`이다.
              "connect-src 'self'",
              // ⚠️ `form-action`은 폼 제출 뒤의 302에도 걸린다 — Google 로그인(POST → `accounts.google.com`)이 빠지면
              // enforce 순간 그 로그인만 조용히 멈춘다 (audit #75).
              "form-action 'self' https://github.com https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
