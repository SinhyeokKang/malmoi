import type { NextConfig } from "next";

import { securityHeaders } from "./lib/security-headers";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  // Leave multipart overhead above the 3 MB image limit.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // 타입·린트 오류를 빌드가 삼키지 않게 둔다(기본값이지만 명시). 게이트는 pnpm typecheck다.
  typescript: { ignoreBuildErrors: false },
  // 앱 버전 문자열 하나만 번들에 박는다 — `lib/app-version.ts`(LNB Changelog 배지)가 읽는다.
  env: { APP_VERSION: version },

  /**
   * ⚠️ Next가 `AGENTS.md`에 자기 블록을 덧붙이는 동작을 끈다.
   *
   * 이 리포의 `AGENTS.md`는 **`scripts/sync-agents.mjs`가 소유하는 Codex 미러**다
   * (`CLAUDE.md` + `.agents/PREAMBLE.md`의 순수 생성물). Next가 덧붙이면 `next dev`를 돌릴
   * 때마다 미러 게이트(`pnpm sync:agents:check`)가 드리프트로 잡고, 지우면 Next가 다시 만든다.
   */
  agentRules: false,

  /**
   * ⚠️ **`/docs`가 `guide/**.md`를 `fs`로 읽는다**(`lib/guide/load.ts`) — 정적 import가 아니라 트레이서가 못 따라가고,
   * 빠지면 Vercel 함수에서 SUMMARY를 못 읽어 `/docs/*` 전부가 500이다. 로컬 `next start`는 리포 파일을 그대로 읽어
   * 못 잡는다 — 판정은 빌드 산출 `.next/server/app/docs/[[...slug]]/page.js.nft.json`이다.
   * 레이아웃(내비)·`not-found`도 SUMMARY를 읽지만 같은 라우트의 함수 안이다.
   * `/api/mcp`는 MCP `read_docs`가 요청마다 읽는 동적 route라 따로 싣는다 — 지금은 nft가 cwd 기준 읽기를 따라 `guide/` 전체를
   * 싣지만 휴리스틱이라 보장이 아니다. 이 글롭은 en 원고를 고정하는 보험이고 MCP가 영어 고정이라 **글롭은 en만**이다(판정은
   * `.next/server/app/api/mcp/route.js.nft.json`). 키 매칭이 포함 매칭이라 `.well-known/…/api/mcp` 함수에도 실리지만 해는 없다.
   */
  outputFileTracingIncludes: { "/docs/[[...slug]]": ["./guide/**/*.md"], "/api/mcp": ["./guide/en/**/*.md"] },

  /**
   * ⚠️ **스트리밍 metadata를 전 UA에서 끈다** (seo-geo spec D8). `/`·`/docs/**`가 세션을 읽어 동적이라 Next는 metadata를
   * 스트리밍하고, HTML-limited 봇 목록 밖의 UA(GPTBot·ClaudeBot·PerplexityBot 포함)는 `<title>`·canonical을 `<head>`가 아니라
   * `<body>` 끝에서 받는다. 정적 `metadata` export도 동적 페이지에서는 스트리밍되므로 페이지별로는 못 막는다.
   */
  htmlLimitedBots: /.*/,

  /**
   * **보안 응답 헤더** (2026-09-09, sec-audit 발견 9 → audit #75). 값은 `lib/security-headers.ts`의 순수 함수가 정한다.
   *
   * ⚠️ **CSP는 여기 없다** (sec-audit-3 #11) — 요청마다 nonce가 바뀌어 `middleware.ts`가 유일한 출처다. 여기 다시 넣으면
   * 헤더가 둘이 되고 브라우저는 교집합을 적용한다.
   *
   * ⚠️ **`tsc`는 이 함수의 형태를 못 본다** — `app/__tests__/security-headers.test.ts`가 설정을 **불러서** 검사한다.
   */
  async headers() {
    const publicAssetCache = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];
    return [
      // 파일명에 해시가 없으므로 immutable은 쓰지 않는다. 교체본은 공유 캐시에서 최장 25시간 늦게 보일 수 있다.
      { source: "/fonts/:path*", headers: publicAssetCache },
      { source: "/guide/:path*", headers: publicAssetCache },
      { source: "/(.*)", headers: securityHeaders() },
    ];
  },

  /**
   * **매칭 없는 경로 + `Accept`에 `text/markdown` → Markdown 404** (ARCHITECTURE §8.1) — 에이전트는 HTML 오류 화면을 못 읽는다.
   * 목적지 `app/not-found.md/route.ts`가 늘 404를 낸다.
   *
   * ⚠️ **`fallback`이어야 한다** — Next는 fallback rewrite를 파일시스템·정적·동적 라우트를 다 본 뒤에만 적용한다. 그래서 존재하는 경로의
   * 응답은 Accept와 무관하게 그대로다(2026-10-15 built server 실측). middleware에서 Accept로 가르면 경로 존재를 몰라 라우트 표를 복제해야 한다.
   * ⚠️ **최상위 동적 세그먼트를 새로 만들면 그 아래에서 이 장치가 조용히 꺼진다** — 그 세그먼트가 미존재 경로를 받아 `notFound()`(HTML)로
   * 끝내기 때문이다. 지금 가장 가까운 동적 세그먼트(`docs/[[...slug]]`·`invite/[token]`·`(edit)/projects/[slug]`)가 같은 이유로 HTML 404다.
   * ⚠️ **`has.value`는 `^…$`로 감싸인 정규식이고 q값을 해석하지 않는다** — `text/markdown;q=0`도 Markdown이다. 받아들인 한계다(ARCHITECTURE §8.1).
   * ⚠️ **대소문자는 라우터마다 다르다** — Next 라우터(`next start`·self-hosted)는 구분해 `Text/Markdown`이 HTML이고, Vercel 라우터는 구분하지 않아
   * Markdown이다(2026-10-15 preview 실측). 어느 쪽이든 `no-store`·`Vary: Accept`라 무해하다. 판정 표(Next 쪽)는 `app/__tests__/rewrites.test.ts`가 고정한다.
   * ⚠️ **목적지는 자사 내부 경로만이다** (POSTMORTEM 2026-09-28) — 외부 rewrite는 프록시라 브라우저가 실은 쿠키·Authorization을 제3자 호스트로
   * 넘긴다. 그 항목의 재발 방지 grep이 이제 이 rewrite를 잡지만 목적지가 `/not-found.md`라 그 위험이 없다. 같은 테스트가 모든 목적지가
   * `/`로 시작하는지 상시로 센다.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [{ source: "/:path*", has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }], destination: "/not-found.md" }],
    };
  },
};

export default nextConfig;
