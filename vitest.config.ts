import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // passWithNoTests를 켜지 않는다 — 테스트가 이미 존재하므로, include glob이 깨져
    // 0개로 잡히는 사고를 초록불로 숨기면 로컬 게이트(/push 1단계)가 무의미해진다.
    environment: "node",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
