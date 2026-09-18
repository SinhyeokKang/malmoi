import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `next/image`의 **정적 import stub** (8-1b).
 *
 * Next 번들러는 `import kv from "…/x.png"`를 `{ src, width, height, blurDataURL }` 객체로 바꾸는데,
 * Vite는 **URL 문자열**만 준다 — 그래서 `<Image src={kv}/>`가 `Image with src "…" is missing
 * required "width" property`로 던지고, 그 화면을 렌더하는 테스트가 통째로 red가 된다.
 *
 * ⚠️ **치수를 1×1로 두는 것이 요지다** — 실제 값은 렌더 결과에 안 쓰이고, 여기서 진짜 크기를
 * 흉내내면 그것이 두 번째 진실이 된다.
 *
 * ⚠️ **`.svg`도 잡는다.** Vite는 SVG를 **data URI로 인라인**하므로 마찬가지로 치수가 없다 —
 * 8-1b 시점에 로고 둘이 `width={48} height={48}`을 명시하고 있어 우연히 green이었고, **그 두
 * 속성을 지우는 순간** 그 화면을 렌더하는 테스트가 `is missing required "width"`로 죽었다(실측).
 * 원인이 vitest 설정에 있다는 것을 알기 어려운 부류라 여기서 대칭을 맞춘다.
 */
const nextStaticImage = {
  name: "next-static-image",
  enforce: "pre" as const,
  load(id: string) {
    const path = id.split("?")[0] ?? "";
    if (!/\.(png|jpe?g|gif|webp|avif|svg)$/.test(path)) return null;
    return `export default { src: ${JSON.stringify(path)}, width: 1, height: 1 };`;
  },
};

export default defineConfig({
  plugins: [nextStaticImage],
  test: {
    // passWithNoTests를 켜지 않는다 — 테스트가 이미 존재하므로, include glob이 깨져
    // 0개로 잡히는 사고를 초록불로 숨기면 로컬 게이트(/push 1단계)가 무의미해진다.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    // next-auth는 `next/server`를 확장자 없이 import해 Node ESM 해석이 실패한다 — 인라인해야 진짜
    // 핸들러를 부를 수 있다 (`lib/login-link/__tests__/http.test.ts`의 `AUTH_URL` 회귀).
    server: { deps: { inline: ["next-auth"] } },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
