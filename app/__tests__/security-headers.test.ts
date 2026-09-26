import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../next.config";
import { buildCsp } from "@/lib/security-headers";

/**
 * **보안 응답 헤더의 배선** (sec-audit 발견 9 → audit #75). 값의 판정은 `lib/__tests__/security-headers.test.ts`가
 * 들고, 여기는 `next.config.ts`가 그것을 **실제로 내는지**만 본다.
 *
 * ⚠️ **`tsc`는 이 파일의 형태를 못 본다** — `headers()`가 없어도, 오타가 나도 타입은 통과한다.
 * 그래서 설정을 **불러서** 검사한다.
 */
type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

async function rules(): Promise<Rule[]> {
  const fn = nextConfig.headers;
  expect(fn, "next.config.ts에 headers()가 없다").toBeTypeOf("function");
  return (await fn!.call(nextConfig)) as Rule[];
}

async function all(): Promise<Header[]> {
  const matched = (await rules()).filter((r) => r.source === "/(.*)");
  expect(matched).toHaveLength(1);
  return matched[0]!.headers;
}

const valueOf = (headers: Header[], key: string): string | undefined =>
  headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

afterEach(() => vi.unstubAllEnvs());

describe("보안 응답 헤더 (sec-audit 9 · audit #75)", () => {
  it("깨질 여지가 없는 넷은 그대로다", async () => {
    const headers = await all();
    expect(valueOf(headers, "X-Content-Type-Options")).toBe("nosniff");
    // ⚠️ `/invite/<token>` 때문에 실질이 가장 크다 — 토큰이 URL에 있다.
    expect(valueOf(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(valueOf(headers, "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(valueOf(headers, "Permissions-Policy")).toContain("camera=()");
  });

  it("CSP는 enforce 헤더 하나다 — Report-Only도, 두 번째 CSP 헤더도 없다", async () => {
    const headers = await all();
    expect(headers.filter((h) => h.key.toLowerCase() === "content-security-policy")).toHaveLength(1);
    expect(valueOf(headers, "Content-Security-Policy-Report-Only")).toBeUndefined();
  });

  it.each([
    ["production", "production", "production"],
    ["production", "preview", "preview"],
    ["development", undefined, "development"],
  ] as const)("NODE_ENV=%s · VERCEL_ENV=%s → %s 정책", async (nodeEnv, vercelEnv, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    if (vercelEnv === undefined) vi.stubEnv("VERCEL_ENV", "");
    else vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(valueOf(await all(), "Content-Security-Policy")).toBe(buildCsp(expected));
  });
});

/**
 * `/docs` 원고의 스크린샷은 `public/guide/`의 같은 origin 파일이다(DESIGN §6.61) — 새 외부 호스트가 없으므로
 * `img-src 'self'`로 충분하다는 것을 여기서 고정한다. 원고 이미지가 외부 URL을 가리키면 G1의 이미지 게이트가 먼저 막는다.
 */
describe("`/docs` 원고 이미지 — 같은 origin", () => {
  it.each(["production", "preview", "development"] as const)("%s 정책의 img-src가 'self'를 든다", (env) => {
    const imgSrc = buildCsp(env).split(";").map((part) => part.trim()).find((part) => part.startsWith("img-src "));
    expect(imgSrc?.split(/\s+/)).toContain("'self'");
  });
});

/**
 * ⚠️ **동적 라우트가 `fs`로 원고를 읽으므로 Vercel 함수 번들에 md가 안 들어갈 수 있다** — 로컬 `next start`는 그것을 못 잡는다.
 * 판정의 정본은 빌드 산출 `.nft.json`이고(수동), 여기는 설정이 그 줄을 드는지만 본다.
 */
describe("`/docs` 원고 트레이스", () => {
  it("`outputFileTracingIncludes`가 `/docs` 라우트에 `guide/**/*.md`를 싣는다", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/docs/[[...slug]]"]).toContain("./guide/**/*.md");
  });
});
