import { describe, expect, it, vi } from "vitest";

import { callbackUrl, requestOrigin } from "../origin";

/**
 * 요청 origin 판정 (malmoi#7). **`redirect_uri`와 쿠키 `secure`가 같은 소스에서 나와야 한다** —
 * 갈리면 쿠키를 심은 origin과 GitHub이 돌려보내는 origin이 달라져 연결이 통째로 실패한다.
 *
 * ⚠️ **`redirect_uri`를 안 보내면 GitHub이 등록된 첫 callback URL을 쓴다.** App에 셋(localhost /
 * preview / 프로덕션)이 등록돼 있어 **로컬에서 시작한 연결이 프로덕션으로 돌아갔다**(T5 실측).
 * state 쿠키는 시작한 origin에 있으므로 그 왕복은 영원히 `state-mismatch`다.
 */

describe("requestOrigin — host와 proto로 origin·secure를 함께 정한다", () => {
  it("x-forwarded-proto가 https면 https origin이고 secure다", () => {
    expect(requestOrigin({ host: "mal-moi.com", forwardedProto: "https" })).toEqual({
      origin: "https://mal-moi.com",
      secure: true,
    });
  });

  it("헤더가 없으면 http다 — 로컬 dev가 그 경로다", () => {
    expect(requestOrigin({ host: "localhost:3000", forwardedProto: null })).toEqual({
      origin: "http://localhost:3000",
      secure: false,
    });
  });

  it("origin과 secure가 **같은 판정에서** 나온다 — 갈리면 쿠키를 못 찾는다", () => {
    // 이 함수가 존재하는 이유다. 두 곳에서 따로 판정하면 한쪽만 바뀌어도 조용히 깨진다.
    for (const proto of ["https", "http", null]) {
      // 허용 목록의 호스트를 쓴다 (2026-09-09) — `example.com`은 이제 모양과 무관하게 거부다.
      const r = requestOrigin({ host: "mal-moi.com", forwardedProto: proto });
      expect(r).not.toBeNull();
      expect(r?.origin.startsWith("https://")).toBe(r?.secure);
    }
  });

  it("프록시 체인이 준 쉼표 목록은 **첫 값**을 쓴다", () => {
    // `x-forwarded-proto: https,http`는 프록시가 둘 이상일 때 실제로 온다. 뒤를 보면 판정이 뒤집힌다.
    expect(requestOrigin({ host: "mal-moi.com", forwardedProto: "https,http" })?.secure).toBe(true);
    expect(requestOrigin({ host: "mal-moi.com", forwardedProto: " https , http " })?.secure).toBe(true);
  });

  it("host가 없으면 null이다 — 추측한 origin으로 사용자를 보내지 않는다", () => {
    expect(requestOrigin({ host: null, forwardedProto: "https" })).toBeNull();
    expect(requestOrigin({ host: "", forwardedProto: "https" })).toBeNull();
  });

  it("host에 스킴이나 경로가 섞여 있으면 null이다 — 헤더는 클라이언트가 조작할 수 있다", () => {
    // GitHub이 등록된 callback URL과 대조하므로 최악이 "연결 실패"이지만, 이상한 값을 그대로
    // 조립해 보내면 실패 원인이 우리 코드가 아니라 GitHub 오류로 보인다.
    for (const host of ["https://evil.com", "mal-moi.com/x", "mal-moi.com?a=1", "a b.com"]) {
      expect(requestOrigin({ host, forwardedProto: "https" })).toBeNull();
    }
  });

  it("포트가 붙은 host는 정상이다", () => {
    expect(requestOrigin({ host: "localhost:3000", forwardedProto: null })?.origin).toBe(
      "http://localhost:3000",
    );
  });
});

describe("callbackUrl — origin에서 callback 경로를 만든다", () => {
  it("origin 뒤에 /api/github/callback을 붙인다", () => {
    expect(callbackUrl("http://localhost:3000")).toBe("http://localhost:3000/api/github/callback");
    expect(callbackUrl("https://mal-moi.com")).toBe("https://mal-moi.com/api/github/callback");
  });

  it("경로가 App에 등록한 것과 **글자 그대로** 같아야 한다 — 다르면 GitHub이 거부한다", () => {
    // 등록값 셋이 전부 `<origin>/api/github/callback`이다. 이 경로가 움직이면 세 환경이 함께 죽는다.
    expect(new URL(callbackUrl("https://x.test")).pathname).toBe("/api/github/callback");
  });
});

describe("authorizeUrl — redirect_uri를 반드시 싣는다 (malmoi#7)", () => {
  /**
   * ⚠️ **이 파라미터가 빠지면 GitHub이 App에 등록된 첫 callback URL을 쓴다.** 셋이 등록돼 있어
   * 로컬에서 시작한 연결이 프로덕션으로 돌아갔고, state 쿠키가 그쪽에 없으므로 영원히
   * `state-mismatch`였다 (T5 실측 → malmoi#7).
   */
  it("주어진 callback URL이 redirect_uri로 들어간다", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv23liTEST");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "secret");
    const { authorizeUrl } = await import("../user");

    const url = new URL(authorizeUrl("nonce-1", "http://localhost:3000/api/github/callback"));

    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/github/callback");
    expect(url.searchParams.get("state")).toBe("nonce-1");
    expect(url.searchParams.get("client_id")).toBe("Iv23liTEST");
    vi.unstubAllEnvs();
  });

  it("환경마다 다른 callback이 그대로 실린다 — 하드코딩이 아니다", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv23liTEST");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "secret");
    const { authorizeUrl } = await import("../user");

    for (const cb of [
      "http://localhost:3000/api/github/callback",
      "https://mal-moi.com/api/github/callback",
      "https://malmoi-git-dev-x.vercel.app/api/github/callback",
    ]) {
      expect(new URL(authorizeUrl("n", cb)).searchParams.get("redirect_uri")).toBe(cb);
    }
    vi.unstubAllEnvs();
  });
});

/**
 * **기대 호스트 허용 목록** (sec-audit 발견 25).
 *
 * `Host`는 클라이언트가 정하는 값이고, 이 한 판정이 `redirect_uri` · state 쿠키 이름 · `secure`
 * 셋을 함께 정한다. 실측으로는 Vercel 엣지가 막고 있지만(`Host: evil.com` → 404
 * `DEPLOYMENT_NOT_FOUND` · `X-Forwarded-Host`는 반영 안 됨, 2026-09-09 프로덕션),
 * **방어가 플랫폼 설정에 얹혀 있으면 그 설정이 바뀔 때 조용히 사라진다.**
 *
 * ⚠️ **모양 검사(`HOST` 정규식)는 `evil.com`도 통과시킨다** — 그것이 이 항목의 요지다.
 */
describe("requestOrigin — 허용 목록 (sec-audit 25)", () => {
  const https = (host: string) => requestOrigin({ host, forwardedProto: "https" });

  it("세 환경의 호스트를 통과시킨다", () => {
    expect(https("mal-moi.com")?.origin).toBe("https://mal-moi.com");
    expect(https("malmoi-git-dev-ox501501-1046s-projects.vercel.app")?.origin).toBe(
      "https://malmoi-git-dev-ox501501-1046s-projects.vercel.app",
    );
    expect(requestOrigin({ host: "localhost:3000", forwardedProto: null })?.origin).toBe("http://localhost:3000");
  });

  it("모르는 호스트는 null이다 — 모양이 맞아도 통과시키지 않는다", () => {
    for (const host of ["evil.com", "mal-moi.com.evil.com", "sub.mal-moi.com", "127.0.0.1.evil.com"]) {
      expect(https(host), host).toBeNull();
    }
  });

  it("localhost는 포트가 달라도 받는다 — 개발 서버가 3000을 못 잡는 경우가 있다", () => {
    expect(requestOrigin({ host: "localhost:3001", forwardedProto: null })?.origin).toBe("http://localhost:3001");
    expect(requestOrigin({ host: "127.0.0.1:3000", forwardedProto: null })?.origin).toBe("http://127.0.0.1:3000");
  });
});
