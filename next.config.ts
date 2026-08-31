import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
