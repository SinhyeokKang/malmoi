import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  session: { status: "none" } as { status: "none" } | { status: "unavailable" } | { status: "ok"; userId: string; name: null; email: null; image: null },
  read: vi.fn(),
  store: vi.fn(),
  fetch: vi.fn(),
  redirect: vi.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }),
  connection: null as null | Record<string, unknown>,
  accounts: [{ provider: "github" }] as { provider: string }[],
}));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), redirect: s.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }), cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => s.session }));
vi.mock("@/lib/oauth-server/authorize", () => ({ readAuthorizationRequest: s.read, storeAuthorizationRequest: s.store }));
vi.mock("@/lib/oauth-server/client-metadata-fetch", () => ({ fetchClientMetadata: s.fetch }));
vi.mock("@/lib/credentials/records", () => ({ decodeUser: (row: unknown) => row }));
vi.mock("@/lib/credentials/access", () => ({ credentialIO: (run: () => Promise<unknown>) => run() }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    user: { findUnique: async () => ({ id: "u1", email: "me@example.com", name: "Me", image: null }) },
    account: { findMany: async () => s.accounts },
    projectMember: { findMany: async () => [{ project: { id: "p1", name: "Web", repoOwner: "acme", repoName: "web" } }] },
    oAuthConnection: { findUnique: async () => s.connection },
  }),
}));
vi.mock("@/lib/failure", () => ({ logCaught: vi.fn() }));

import Page from "../page";

/**
 * `/oauth/authorize` 서버 판정 (mcp-oauth design §1 · §6.1 · 핸드오프 §10.1). 콜백 대조 전의 실패는 **리다이렉트하지 않고** 화면이 끝내고,
 * CIMD 가져오기의 세 실패는 한 문구다. `?request=`는 조회 장애 → 요청 상태 → 세션 순서이고, 요청이 없거나 끝났으면 명시적으로 끝낸다.
 */

const CLAUDE = "https://claude.ai/oauth/claude-code-client-metadata";
const REDIRECT = "http://localhost:51234/callback";
const RESOURCE = "http://localhost:3000/api/mcp";
const QUERY = {
  client_id: CLAUDE, redirect_uri: REDIRECT, response_type: "code", code_challenge: "c".repeat(43), code_challenge_method: "S256", state: "st", resource: RESOURCE,
};
const REQUEST = { clientId: CLAUDE, clientName: "Claude Code", redirectUri: REDIRECT };
const html = async (params: Record<string, string | string[] | undefined>) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
const redirectedTo = async (params: Record<string, string>) => {
  try { await Page({ searchParams: Promise.resolve(params) }); } catch (error) { return (error as { url?: string }).url; }
  return undefined;
};

beforeEach(() => {
  vi.clearAllMocks();
  s.session = { status: "none" };
  s.connection = null;
  s.accounts = [{ provider: "github" }];
  s.fetch.mockResolvedValue({ ok: true, client: { clientId: CLAUDE, clientName: "Claude Code", displayName: "Claude Code", redirectUris: ["http://localhost/callback"] } });
  s.store.mockResolvedValue({ ok: true, requestId: "req_1" });
  s.read.mockResolvedValue({ status: "ok", request: REQUEST });
});

describe("클라이언트가 연 쿼리", () => {
  it("검증을 지나면 요청을 저장하고 ?request= 정규형으로 보낸다 (발급 환경은 이 요청의 origin)", async () => {
    expect(await redirectedTo(QUERY)).toBe("/oauth/authorize?request=req_1");
    expect(s.store).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ endpoint: { issuer: "http://localhost:3000", resource: RESOURCE } }));
  });

  it("쿼리가 틀리면 리다이렉트하지 않고 화면이 끝낸다 — 문서도 가져오지 않는다", async () => {
    for (const over of [{ response_type: "token" }, { code_challenge_method: "plain" }, { resource: "https://mal-moi.com/api/mcp" }, { redirect_uri: "javascript:alert(1)" }]) {
      const page = await html({ ...QUERY, ...over });
      expect(page, JSON.stringify(over)).toContain("This app can&#x27;t connect");
    }
    expect(s.redirect).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("CIMD 가져오기의 세 실패는 같은 화면이다 — 어느 호스트가 사설 주소인지 말하지 않는다", async () => {
    const pages = [];
    for (const reason of ["blocked-address", "unreachable", "invalid-document"]) {
      s.fetch.mockResolvedValueOnce({ ok: false, reason });
      pages.push(await html(QUERY));
    }
    expect(new Set(pages).size).toBe(1);
    expect(pages[0]).toContain("This app can&#x27;t connect");
    expect(pages[0]).not.toContain("claude.ai/oauth");
    expect(s.store).not.toHaveBeenCalled();
    expect(s.redirect).not.toHaveBeenCalled();
  });

  it("등록 대조 실패(저장 거부)는 종료 · 저장 장애는 같은 쿼리로 재시도", async () => {
    s.store.mockResolvedValueOnce({ ok: false });
    expect(await html(QUERY)).toContain("This app can&#x27;t connect");
    s.store.mockRejectedValueOnce(new Error("db down"));
    const page = await html(QUERY);
    expect(page).toContain("We couldn&#x27;t load this request");
    expect(page).toContain(`href="/oauth/authorize?client_id=${encodeURIComponent(CLAUDE)}`);
    expect(s.redirect).not.toHaveBeenCalled();
  });
});

describe("?request= — 요청 상태", () => {
  it.each([["missing", "We couldn&#x27;t find this request"], ["expired", "This request expired"], ["consumed", "This request was already answered"]])(
    "%s → 종료 화면 · 로그인 상태면 내 프로젝트 출구, 아니면 출구 없음 · 클라이언트로 돌아가는 버튼 없음",
    async (reason, title) => {
      s.read.mockResolvedValue({ status: "unavailable", reason });
      const signedOut = await html({ request: "req_1" });
      expect(signedOut).toContain(title);
      expect(signedOut).not.toContain("Go to your projects");
      expect(signedOut).not.toContain("Continue with GitHub");
      s.session = { status: "ok", userId: "u1", name: null, email: null, image: null };
      const signedIn = await html({ request: "req_1" });
      expect(signedIn).toContain('href="/projects"');
      expect(signedIn).not.toContain(REDIRECT);
    },
  );

  it("조회 장애는 없음과 다른 화면이다 — 같은 요청으로 재시도", async () => {
    s.read.mockRejectedValue(new Error("db down"));
    const page = await html({ request: "req_1" });
    expect(page).toContain("We couldn&#x27;t load this request");
    expect(page).toContain('href="/oauth/authorize?request=req_1"');
    expect(page).not.toContain("We couldn&#x27;t find this request");
  });
});

describe("?request= — 세션", () => {
  it("무세션 → 이 화면의 공급자 버튼 · 앱 카드(이름 + 식별 줄) · 동의 폼은 없다", async () => {
    const page = await html({ request: "req_1" });
    expect(page).toContain("Continue with GitHub");
    expect(page).toContain("Continue with Google");
    expect(page).toContain("Claude Code");
    expect(page).toContain("claude.ai/oauth/claude-code-client-metadata");
    expect(page).toContain("The app chose this name.");
    expect(page).not.toContain("Authorize");
    expect(page).not.toContain("You were signed out.");
  });

  it("동의 중 세션이 끝났으면 경고가 먼저 낭독된다 (`1k`)", async () => {
    const page = await html({ request: "req_1", e: "signed-out" });
    expect(page).toMatch(/role="alert"[^>]*>.*You were signed out\./);
  });

  it("세션을 못 읽으면 로그인 버튼 대신 재시도 — 헛로그인시키지 않는다", async () => {
    s.session = { status: "unavailable" };
    const page = await html({ request: "req_1" });
    expect(page).toContain("We couldn&#x27;t load this request");
    expect(page).not.toContain("Continue with GitHub");
  });

  it("세션 있음 → 동의 폼 · 계정 카드 · 돌아갈 곳(loopback은 포트까지)", async () => {
    s.session = { status: "ok", userId: "u1", name: null, email: null, image: null };
    const page = await html({ request: "req_1" });
    expect(page).toContain("me@example.com");
    expect(page).toContain("Signed in with GitHub");
    expect(page).toContain("Not you?");
    expect(page).toContain("Authorize");
    expect(page).toContain("You&#x27;ll return to localhost:51234.");
    expect(page).not.toContain("replaces it");
    // 수단이 둘이면 어느 쪽으로 들어왔는지 말할 수 없다 — 줄을 그리지 않는다.
    s.accounts = [{ provider: "github" }, { provider: "google" }];
    expect(await html({ request: "req_1" })).not.toContain("Signed in with");
  });

  it("같은 클라이언트의 연결이 있으면 대체 경고(연결일) + 기존 값으로 채운다", async () => {
    s.session = { status: "ok", userId: "u1", name: null, email: null, image: null };
    s.connection = {
      id: "c1", clientId: CLAUDE, clientName: "Claude Code", grants: ["member:manage"], allProjects: false, projectIds: ["p1", "gone"],
      createdAt: new Date("2026-09-12T08:00:00.000Z"), lastUsedAt: null, expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    const page = await html({ request: "req_1" });
    expect(page).toContain("You connected this app on Sep 12, 2026.");
    expect(page).toMatch(/data-grant="member:manage"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-grant="member:manage"/);
    expect(page).toMatch(/data-scope-project="p1"/);
  });

  it("이름이 없으면 clientId URL이 이름이다 · 클라이언트가 정한 이름은 이스케이프된다 · 긴 이름은 말줄임하지 않는다", async () => {
    s.read.mockResolvedValue({ status: "ok", request: { ...REQUEST, clientName: null } });
    expect(await html({ request: "req_1" })).toContain(`>${CLAUDE}<`);
    s.read.mockResolvedValue({ status: "ok", request: { ...REQUEST, clientName: `<img src=x onerror=alert(1)> ${"Very long name ".repeat(10)}` } });
    const page = await html({ request: "req_1" });
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("&lt;img src=x onerror=alert(1)&gt;");
    const card = page.slice(page.indexOf("data-app-card"));
    expect(card.slice(0, 600)).not.toContain("truncate");
  });
});
