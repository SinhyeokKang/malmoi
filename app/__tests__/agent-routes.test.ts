import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { apiNotFoundBody, markdownNotFound } from "@/lib/seo/agent-errors";
import { openApiDocument } from "@/lib/openapi/document";

/**
 * **에이전트가 읽는 공개 route 셋의 배선** (ARCHITECTURE §8.1). 판정은 `lib/seo/__tests__/agent-errors.test.ts`·
 * `lib/openapi/__tests__/document.test.ts`가 들고, 여기는 route가 그 판정을 부르는지 · 메서드 집합 · 헤더 · 렌더 방식을 본다.
 * 셋 다 무인증 공개 문서라 DB·쿠키·요청 헤더를 읽지 않는다(Accept 판정은 라우터가 한다 — `next.config.ts`).
 */

const APP = fileURLToPath(new URL("..", import.meta.url));
const METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];

const notFoundMd = await import("../not-found.md/route");
const apiCatchAll = await import("../api/[[...path]]/route");
const openapi = await import("../openapi.json/route");

type Handler = () => Response | Promise<Response>;
const handlers = (mod: Record<string, unknown>) => Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k)).sort();
const call = (mod: Record<string, unknown>, method: string) => (mod[method] as Handler)();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("`/not-found.md` — 매칭 없는 경로 + Accept text/markdown의 fallback rewrite 목적지", () => {
  // rewrite는 메서드를 가리지 않는다 — GET만 두면 미존재 경로 POST가 405가 된다(§0 실측).
  it("일곱 메서드를 전부 내보낸다", () => {
    expect(handlers(notFoundMd)).toEqual(METHODS);
  });

  it("`force-dynamic`이다 — 본문이 런타임 배포 모드로 갈린다(같은 이미지가 self-hosted로 돈다)", () => {
    expect(notFoundMd.dynamic).toBe("force-dynamic");
  });

  it.each(METHODS)("%s → 404 text/markdown · Vary: Accept · no-store · hosted 본문", async (method) => {
    vi.stubEnv("MALMOI_ORIGIN", "");
    const res = await call(notFoundMd, method);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe(markdownNotFound({ kind: "hosted", vercelEnv: undefined }));
  });

  it("self-hosted는 요청 시점 모드의 본문이다", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
    const body = await (await call(notFoundMd, "GET")).text();
    expect(body).toBe(markdownNotFound({ kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com" }));
  });
});

describe("`/api/[[...path]]` — 어떤 route도 받지 않는 /api 경로", () => {
  it("일곱 메서드를 전부 내보낸다", () => {
    expect(handlers(apiCatchAll)).toEqual(METHODS);
  });

  it.each(METHODS)("%s → 404 application/json · apiNotFoundBody", async (method) => {
    const res = await call(apiCatchAll, method);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(apiNotFoundBody());
  });
});

describe("`/openapi.json`", () => {
  it("GET만 내보내고 `force-static`이다 — 상대 서버 URL이라 모드 분기가 없다", () => {
    expect(handlers(openapi)).toEqual(["GET"]);
    expect(openapi.dynamic).toBe("force-static");
  });

  it("200 application/json · 본문은 openApiDocument(appVersion())", async () => {
    vi.stubEnv("APP_VERSION", "9.9.9");
    const res = await call(openapi, "GET");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(openApiDocument("9.9.9"))));
  });
});

describe("무인증 공개 문서 — DB·쿠키·요청 헤더를 읽지 않는다", () => {
  /** 주석은 벗긴다 — 경계를 설명하는 문장이 `cookies`를 인용할 수 있다. */
  const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");

  it.each(["not-found.md/route.ts", "api/[[...path]]/route.ts", "openapi.json/route.ts"])("%s", (path) => {
    const code = codeOnly(readFileSync(`${APP}/${path}`, "utf8"));
    expect(code).not.toContain("@/lib/db");
    expect(code).not.toContain("next/headers");
    expect(code).not.toContain("cookies(");
    expect(code).not.toContain("request.headers");
  });
});
