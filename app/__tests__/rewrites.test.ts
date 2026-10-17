import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

/**
 * **`next.config.ts`의 rewrite** (ARCHITECTURE §8.1). ⚠️ **`tsc`는 이 함수의 형태를 못 본다** — 설정을 **불러서** 검사한다
 * (`security-headers.test.ts`와 같은 형).
 */

type Has = { type: string; key: string; value?: string };
type Rewrite = { source: string; destination: string; has?: Has[] };
type Rewrites = { beforeFiles: Rewrite[]; afterFiles: Rewrite[]; fallback: Rewrite[] };

async function rewrites(): Promise<Rewrites> {
  const fn = nextConfig.rewrites;
  expect(fn, "next.config.ts에 rewrites()가 없다").toBeTypeOf("function");
  return (await fn!.call(nextConfig)) as Rewrites;
}

describe("rewrites()", () => {
  it("fallback 하나뿐이다 — 파일시스템·동적 라우트를 다 본 뒤에만 돌아 존재하는 경로의 응답을 바꾸지 않는다", async () => {
    const { beforeFiles, afterFiles, fallback } = await rewrites();
    expect(beforeFiles).toEqual([]);
    expect(afterFiles).toEqual([]);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({ source: "/:path*", destination: "/not-found.md" });
  });

  // POSTMORTEM 2026-09-28 — 외부 rewrite는 프록시라 브라우저가 실은 쿠키·Authorization을 제3자 호스트로 넘긴다.
  it("모든 목적지가 `/`로 시작하는 내부 경로다", async () => {
    const { beforeFiles, afterFiles, fallback } = await rewrites();
    for (const rule of [...beforeFiles, ...afterFiles, ...fallback]) {
      expect(rule.destination.startsWith("/") && !rule.destination.startsWith("//"), rule.destination).toBe(true);
    }
  });

  /**
   * **이 표는 Next 라우터의 판정이다** — Next는 `has.value`를 `^…$`로 감싸고 대소문자를 구분한다(`prepare-destination.js`). 설정이 정하는 것이
   * 이 정규식이라 여기서 센다. ⚠️ **Vercel 라우터는 대소문자를 구분하지 않는다** — `Text/Markdown`도 Markdown이다(2026-10-15 preview 실측).
   * q값을 해석하지 않는 것은 받아들인 한계다(ARCHITECTURE §8.1).
   */
  it.each([
    ["text/markdown", true],
    ["text/markdown; charset=utf-8", true],
    ["text/markdown;q=0.9, text/html", true],
    ["text/html, text/markdown", true],
    ["text/markdown;q=0", true],
    ["Text/Markdown", false],
    ["text/html", false],
    ["*/*", false],
    ["", false],
  ])("Accept %j → Markdown %s", async (accept, markdown) => {
    const { fallback } = await rewrites();
    const has = fallback[0]?.has ?? [];
    expect(has).toHaveLength(1);
    expect(has[0]).toMatchObject({ type: "header", key: "accept" });
    expect(new RegExp(`^${has[0]?.value}$`).test(accept)).toBe(markdown);
  });
});

/**
 * ⚠️ **최상위 동적 세그먼트가 생기면 Markdown 404가 조용히 꺼진다** — 그 세그먼트가 미존재 경로를 받아 `notFound()`(HTML)로 끝내므로
 * fallback rewrite까지 가지 않는다. build·typecheck는 green이고 증상은 Accept markdown이 HTML 404로 돌아가는 것뿐이라 여기서 센다.
 * route group `(…)`은 URL에 안 실리므로 그 바로 아래도 최상위다.
 */
describe("최상위 동적 세그먼트", () => {
  it("app/ 최상위와 route group 바로 아래에 `[`로 시작하는 디렉터리가 없다", () => {
    const app = fileURLToPath(new URL("..", import.meta.url));
    const dirs = (path: string) => readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const top = dirs(app);
    const groups = top.filter((name) => name.startsWith("(") && name.endsWith(")"));
    const segments = [...top, ...groups.flatMap((group) => dirs(`${app}/${group}`).map((name) => `${group}/${name}`))];
    const dynamic = segments.filter((path) => path.split("/").at(-1)?.startsWith("["));
    expect(dynamic, "최상위 동적 세그먼트가 Markdown 404(fallback rewrite)를 그 아래에서 끈다 — ARCHITECTURE §8.1").toEqual([]);
  });
});
