import { describe, expect, it } from "vitest";

import { buildCsp, createNonce, cspEnvironment, isBlobPublicHost, securityHeaders } from "../security-headers";

/**
 * **CSP는 enforce다** (2026-09-24, audit #75 round 1 — 사용자 판정 "보안 강하게"). 정책은 환경 셋으로 갈린다:
 * 프로덕션이 기준이고, `next dev`는 React Refresh의 eval과 HMR 웹소켓을, preview는 Vercel Toolbar 호스트를 더한다.
 */
const directive = (csp: string, name: string): string[] =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("cspEnvironment", () => {
  it("dev가 VERCEL_ENV보다 앞이고, 모르는 값은 프로덕션으로 접힌다(가장 좁은 쪽)", () => {
    expect(cspEnvironment({ nodeEnv: "development", vercelEnv: "preview" })).toBe("development");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: "preview" })).toBe("preview");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: "production" })).toBe("production");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: undefined })).toBe("production");
    expect(cspEnvironment({ nodeEnv: undefined, vercelEnv: "development" })).toBe("production");
  });
});

/** 테스트용 스토어 호스트 — 모양만 맞으면 된다. */
const BLOB = "abc123xyz.public.blob.vercel-storage.com";
const NONCE = "AAECAwQFBgcICQoLDA0ODw==";

describe("createNonce (sec-audit-3 #11)", () => {
  // Next가 요청 CSP 헤더에서 nonce를 뽑는 정규식(`get-script-nonce-from-header`) — 모양이 어긋나면 조용히 nonce 없이 렌더한다.
  const NEXT_NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/;

  it("16바이트 base64 — Next가 읽는 모양이다", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(NEXT_NONCE);
    expect(atob(nonce)).toHaveLength(16);
  });

  it("요청마다 다르다", () => {
    expect(new Set(Array.from({ length: 50 }, createNonce)).size).toBe(50);
  });
});

describe("buildCsp — script nonce (sec-audit-3 #11)", () => {
  it.each(["production", "preview", "development"] as const)("%s의 script-src에 `'unsafe-inline'`이 없고 nonce + strict-dynamic이다", (env) => {
    const script = directive(buildCsp(env, { nonce: NONCE, blobHost: BLOB }), "script-src");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script.slice(0, 3)).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
  });

  it("style-src는 `'unsafe-inline'`을 남긴다 — nonce는 `style` 속성에 안 붙는다(결정 B의 잔여)", () => {
    expect(directive(buildCsp("production", { nonce: NONCE, blobHost: BLOB }), "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it.each([["따옴표 주입", "abc' 'unsafe-inline"], ["지시어 주입", "abc; script-src *"], ["빈 값", ""]])("모양이 틀린 nonce(%s)는 던진다 — 정책에 이어 붙이지 않는다", (_label, nonce) => {
    expect(() => buildCsp("production", { nonce, blobHost: BLOB })).toThrow();
  });
});

describe("isBlobPublicHost (sec-audit-3 #12)", () => {
  it("Vercel Blob 공개 호스트 하나의 모양만 받는다", () => {
    expect(isBlobPublicHost(BLOB)).toBe(true);
    expect(isBlobPublicHost("0a.public.blob.vercel-storage.com")).toBe(true);
  });

  it.each([
    ["와일드카드", "*.public.blob.vercel-storage.com"],
    ["스킴 포함", "https://abc.public.blob.vercel-storage.com"],
    ["경로 포함", "abc.public.blob.vercel-storage.com/x"],
    ["대문자", "ABC.public.blob.vercel-storage.com"],
    ["하위 라벨 둘", "a.b.public.blob.vercel-storage.com"],
    ["다른 도메인 접미", "abc.public.blob.vercel-storage.com.evil.test"],
    ["CSP 지시어 주입", "abc.public.blob.vercel-storage.com; script-src *"],
    ["공백 주입", "abc.public.blob.vercel-storage.com https://evil.test"],
    ["끝 개행", "abc.public.blob.vercel-storage.com\n"],
    ["빈 라벨", ".public.blob.vercel-storage.com"],
    ["빈 문자열", ""],
  ])("%s는 거부한다", (_label, host) => {
    expect(isBlobPublicHost(host)).toBe(false);
  });
});

describe("buildCsp — Blob 호스트 (sec-audit-3 #12)", () => {
  const imgSrc = (blobHost: string | undefined) => directive(buildCsp("production", { nonce: NONCE, blobHost }), "img-src");

  it("이 환경의 스토어 하나만 연다 — 와일드카드는 어느 환경에도 없다", () => {
    expect(imgSrc(BLOB)).toContain(`https://${BLOB}`);
    for (const env of ["production", "preview", "development"] as const) {
      expect(buildCsp(env, { nonce: NONCE, blobHost: BLOB })).not.toContain("*.public.blob.vercel-storage.com");
    }
  });

  it("없으면 Blob 호스트를 넣지 않는다 — fail-closed", () => {
    expect(imgSrc(undefined).some((s) => s.includes("blob.vercel-storage.com"))).toBe(false);
  });

  it("모양이 틀린 값은 없는 것으로 친다 — 정책에 한 글자도 새지 않는다", () => {
    const csp = buildCsp("production", { nonce: NONCE, blobHost: "abc.public.blob.vercel-storage.com; script-src *" });
    expect(csp).not.toContain("blob.vercel-storage.com");
    expect(csp).toBe(buildCsp("production", { nonce: NONCE, blobHost: undefined }));
  });
});

describe("buildCsp", () => {
  const prod = buildCsp("production", { nonce: NONCE, blobHost: BLOB });

  it("프로덕션 기준 지시어 — 현재 흐름이 쓰는 호스트만 연다", () => {
    expect(directive(prod, "default-src")).toEqual(["'self'"]);
    expect(directive(prod, "script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
    expect(directive(prod, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(prod, "font-src")).toEqual(["'self'"]);
    expect(directive(prod, "img-src")).toEqual(["'self'", "data:", "https://avatars.githubusercontent.com", "https://lh3.googleusercontent.com", `https://${BLOB}`]);
    expect(directive(prod, "connect-src")).toEqual(["'self'"]);
    // ⚠️ Google 로그인은 폼 POST → 302 `accounts.google.com`이다 — `form-action`은 그 리다이렉트에도 걸린다.
    expect(directive(prod, "form-action")).toEqual(["'self'", "https://github.com", "https://accounts.google.com"]);
    expect(directive(prod, "object-src")).toEqual(["'none'"]);
    expect(directive(prod, "base-uri")).toEqual(["'self'"]);
    expect(directive(prod, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("프로덕션에는 eval도 Vercel 호스트도 없다", () => {
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("vercel.live");
    expect(prod).not.toContain("pusher.com");
    expect(prod).not.toMatch(/\bws:|\bwss:/);
  });

  it("dev는 eval과 HMR 웹소켓만 더한다", () => {
    const dev = buildCsp("development", { nonce: NONCE, blobHost: BLOB });
    expect(directive(dev, "script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'", "'unsafe-eval'"]);
    expect(directive(dev, "connect-src")).toEqual(["'self'", "ws:", "wss:"]);
    expect(dev).not.toContain("vercel.live");
    expect(directive(dev, "form-action")).toEqual(directive(prod, "form-action"));
  });

  it("preview는 Vercel Toolbar 문서의 호스트를 더하고 eval은 없다", () => {
    const preview = buildCsp("preview", { nonce: NONCE, blobHost: BLOB });
    expect(preview).not.toContain("'unsafe-eval'");
    expect(directive(preview, "script-src")).toContain("https://vercel.live");
    expect(directive(preview, "connect-src")).toEqual(expect.arrayContaining(["https://vercel.live", "wss://ws-us3.pusher.com"]));
    expect(directive(preview, "img-src")).toEqual(expect.arrayContaining(["https://vercel.live", "https://vercel.com", "blob:"]));
    expect(directive(preview, "frame-src")).toEqual(["'self'", "https://vercel.live"]);
    expect(directive(preview, "style-src")).toContain("https://vercel.live");
    expect(directive(preview, "font-src")).toEqual(["'self'", "https://vercel.live", "https://assets.vercel.com"]);
    // 짝: 프로덕션 기준은 그대로 남는다.
    expect(directive(preview, "form-action")).toEqual(directive(prod, "form-action"));
    expect(directive(preview, "frame-ancestors")).toEqual(["'none'"]);
  });
});

describe("securityHeaders", () => {
  /** CSP는 **미들웨어만** 낸다(요청마다 nonce) — 정적 헤더에 남으면 브라우저가 둘의 교집합을 적용해 nonce 정책이 무의미해진다. */
  it("CSP를 싣지 않는다 — Report-Only도 없다", () => {
    const keys = securityHeaders().map((h) => h.key.toLowerCase());
    expect(keys).not.toContain("content-security-policy");
    expect(keys).not.toContain("content-security-policy-report-only");
    expect(keys).toEqual(["x-content-type-options", "x-frame-options", "referrer-policy", "strict-transport-security", "permissions-policy"]);
  });

  it("X-Frame-Options는 DENY다 — CSP를 안 받는 응답(`/api/auth/signout` 폼)도 프레이밍을 막는다", () => {
    expect(securityHeaders().find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
  });

  it("HSTS는 하위 도메인까지 묶고 preload를 선언한다 — 목록 제출은 사람의 몫이다", () => {
    expect(securityHeaders().find((h) => h.key === "Strict-Transport-Security")?.value).toBe("max-age=63072000; includeSubDomains; preload");
  });
});
