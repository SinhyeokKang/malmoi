import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkOrigin } from "../http";

/**
 * `Origin` 검증 (mcp-connector design §1.2 — 검수 J). **검증하되 없으면 거부하지 않는다** — Node `fetch`·CLI는 `Origin`을 안 싣고,
 * 브라우저 클라이언트(MCP Inspector)는 같은 origin에서 붙을 수 있다. 있으면 `ALLOWED_HOSTS`와 대조한다(DNS rebinding 권고).
 * CSRF 방어의 전부는 "쿠키를 읽지 않는다"이고 이것은 그 위의 한 겹이다.
 */

const headers = (origin?: string) => new Headers(origin === undefined ? {} : { origin });

describe("checkOrigin", () => {
  it("Origin이 없으면 통과", () => {
    expect(checkOrigin(headers())).toBe(true);
  });

  it.each(["https://mal-moi.com", "https://dev.mal-moi.com", "http://localhost:3000", "http://127.0.0.1:3917", "https://MAL-MOI.com"])("허용 호스트 %s → 통과", origin => {
    expect(checkOrigin(headers(origin))).toBe(true);
  });

  it.each(["https://evil.example", "https://mal-moi.com.evil.example", "https://evilmal-moi.com", "null", "not a url", "", "file:///etc/passwd"])("다른 host·형식 오류 %j → 거부", origin => {
    expect(checkOrigin(headers(origin))).toBe(false);
  });
});

/** self-hosted에서는 설정 origin만 받는다 — hosted·로컬 Origin도 다른 Origin이다(self-hosting design §2). */
describe("checkOrigin — self-hosted", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Origin이 없으면 통과 · 설정 origin이면 통과", () => {
    expect(checkOrigin(headers())).toBe(true);
    expect(checkOrigin(headers("https://malmoi.example.com"))).toBe(true);
  });

  it.each(["https://mal-moi.com", "https://dev.mal-moi.com", "http://localhost:3000", "http://127.0.0.1:3917", "https://evil.example", "https://malmoi.example.com.evil.example", "https://sub.malmoi.example.com", "https://malmoi.example.com:8443", "http://malmoi.example.com", "null"])("다른 Origin %s → 거부", origin => {
    expect(checkOrigin(headers(origin))).toBe(false);
  });
});
