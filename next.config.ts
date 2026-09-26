import type { NextConfig } from "next";

import { cspEnvironment, securityHeaders } from "./lib/security-headers";

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
   * ⚠️ **`/docs`가 `guide/**.md`를 `fs`로 읽는다**(`lib/guide/load.ts`) — 정적 import가 아니라 트레이서가 못 따라가고,
   * 빠지면 Vercel 함수에서 SUMMARY를 못 읽어 `/docs/*` 전부가 500이다. 로컬 `next start`는 리포 파일을 그대로 읽어
   * 못 잡는다 — 판정은 빌드 산출 `.next/server/app/docs/[[...slug]]/page.js.nft.json`이다.
   * 레이아웃(내비)·`not-found`도 SUMMARY를 읽지만 같은 라우트의 함수 안이다.
   */
  outputFileTracingIncludes: { "/docs/[[...slug]]": ["./guide/**/*.md"] },

  /**
   * **보안 응답 헤더** (2026-09-09, sec-audit 발견 9 → audit #75). 값은 `lib/security-headers.ts`의 순수 함수가 정한다.
   *
   * ⚠️ **env는 이 함수 안에서만 읽는다** — next.config는 빌드·기동 시점에 평가되고, `next build`의
   * `NODE_ENV`와 Vercel의 `VERCEL_ENV`가 그때 정해져 있다. 모듈 최상위로 올리지 않는다.
   *
   * ⚠️ **`tsc`는 이 함수의 형태를 못 본다** — `app/__tests__/security-headers.test.ts`가 설정을 **불러서** 검사한다.
   */
  async headers() {
    const env = cspEnvironment({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV });
    return [{ source: "/(.*)", headers: securityHeaders(env) }];
  },
};

export default nextConfig;
