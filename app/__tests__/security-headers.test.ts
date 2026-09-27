import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import middleware from "../../middleware";
import nextConfig from "../../next.config";
import { buildCsp } from "@/lib/security-headers";

/**
 * **보안 응답 헤더의 배선** (sec-audit 발견 9 → audit #75 → sec-audit-3 #11). 값의 판정은
 * `lib/__tests__/security-headers.test.ts`가 들고, 여기는 **CSP는 미들웨어가, 나머지 다섯은 `next.config.ts`가**
 * 실제로 내는지만 본다.
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

  // `/api/auth/signout`은 Auth.js 기본 폼 HTML이고 CSP(→ `frame-ancestors`)를 안 받는다 — 정적 헤더가 프레이밍을 막는다.
  it("X-Frame-Options: DENY가 모든 경로에 붙는다 (sec-audit-3 fix1)", async () => {
    expect(valueOf(await all(), "X-Frame-Options")).toBe("DENY");
  });

  it("next.config는 CSP를 내지 않는다 — 미들웨어가 유일한 출처다(헤더 하나)", async () => {
    const headers = await all();
    expect(valueOf(headers, "Content-Security-Policy")).toBeUndefined();
    expect(valueOf(headers, "Content-Security-Policy-Report-Only")).toBeUndefined();
  });
});

/**
 * **CSP nonce의 배선** (sec-audit-3 #11). ⚠️ Next는 **요청** 헤더의 CSP에서 nonce를 뽑아 자기 스크립트에 붙인다 —
 * 응답에만 실으면 페이지의 모든 스크립트가 nonce 없이 나가 enforce 정책에 막힌다. 그래서 요청 쪽 덮어쓰기를 함께 본다.
 */
describe("미들웨어 CSP (sec-audit-3 #11)", () => {
  const BLOB = "abc123.public.blob.vercel-storage.com";
  const run = (path: string, cookie?: string) => {
    const request = new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined);
    const response = middleware(request);
    expect(response, "미들웨어가 응답을 내지 않았다").toBeDefined();
    return response!;
  };
  const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

  it.each(["/", "/signin", "/invite/sample", "/docs"])("공개 페이지 %s — 응답과 요청 CSP가 같은 nonce를 든다", (path) => {
    const response = run(path);
    const csp = response.headers.get("content-security-policy");
    expect(nonceOf(csp)).toBeTruthy();
    // `NextResponse.next({ request })`가 요청 헤더 덮어쓰기를 이 둘로 싣는다.
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).toContain("content-security-policy");
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(response.headers.get("location")).toBeNull();
  });

  it("세션 쿠키가 있는 보호 페이지도 CSP를 받는다", () => {
    const response = run("/projects/sample/keys", "authjs.session-token=x");
    expect(nonceOf(response.headers.get("content-security-policy"))).toBeTruthy();
  });

  it("쿠키 없는 보호 페이지는 여전히 로그인으로 보낸다", () => {
    const response = run("/projects/sample/keys");
    expect(new URL(response.headers.get("location") ?? "", "http://localhost").pathname).toBe("/signin");
  });

  it("nonce가 요청마다 다르다", () => {
    expect(nonceOf(run("/").headers.get("content-security-policy"))).not.toBe(nonceOf(run("/").headers.get("content-security-policy")));
  });

  it.each([
    ["production", "production", "production"],
    ["production", "preview", "preview"],
    ["development", undefined, "development"],
  ] as const)("NODE_ENV=%s · VERCEL_ENV=%s → %s 정책", (nodeEnv, vercelEnv, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VERCEL_ENV", vercelEnv ?? "");
    vi.stubEnv("BLOB_PUBLIC_HOST", BLOB);
    const csp = run("/").headers.get("content-security-policy");
    expect(csp).toBe(buildCsp(expected, { nonce: nonceOf(csp)!, blobHost: BLOB }));
  });

  it("`BLOB_PUBLIC_HOST`가 없으면 Blob 호스트가 정책에 없다 — fail-closed (sec-audit-3 #12)", () => {
    vi.stubEnv("BLOB_PUBLIC_HOST", "");
    expect(run("/").headers.get("content-security-policy")).not.toContain("blob.vercel-storage.com");
  });
});

/**
 * ⚠️ **정적 렌더된 페이지는 nonce를 못 받는다** — 빌드 시점엔 요청 헤더가 없어 스크립트가 nonce 없이 굳고, 요청마다
 * 새 nonce를 내는 정책에 **전부** 막힌다(화면은 뜨고 버튼만 죽는다). 루트 레이아웃이 요청을 기다려 전 페이지를 동적으로 만든다.
 * `tsc`도 `pnpm test`도 그 결과를 못 보므로 소스에서 고정한다 — 판정의 정본은 `pnpm build`의 라우트 표(`○` 0개)다.
 */
describe("전 페이지가 동적이다 (sec-audit-3 #11)", () => {
  it("루트 레이아웃이 `connection()`을 기다린다", () => {
    const source = readFileSync(fileURLToPath(new URL("../layout.tsx", import.meta.url)), "utf8");
    expect(source).toMatch(/import \{[^}]*\bconnection\b[^}]*\} from "next\/server"/);
    expect(source).toMatch(/await connection\(\)/);
  });
});

/**
 * `/docs` 원고의 스크린샷은 `public/guide/`의 같은 origin 파일이다(DESIGN §6.61) — 새 외부 호스트가 없으므로
 * `img-src 'self'`로 충분하다는 것을 여기서 고정한다. 원고 이미지가 외부 URL을 가리키면 G1의 이미지 게이트가 먼저 막는다.
 */
describe("`/docs` 원고 이미지 — 같은 origin", () => {
  it.each(["production", "preview", "development"] as const)("%s 정책의 img-src가 'self'를 든다", (env) => {
    const imgSrc = buildCsp(env, { nonce: "AAAA", blobHost: undefined }).split(";").map((part) => part.trim()).find((part) => part.startsWith("img-src "));
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
