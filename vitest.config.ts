import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // 하네스가 코드보다 먼저 서므로 테스트 0개 상태가 정상이다. 첫 테스트가 들어오면
    // 이 플래그는 무의미해지지만 남겨둔다 — 지우면 새 체크아웃에서 pnpm test가 빨간불이다.
    passWithNoTests: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
