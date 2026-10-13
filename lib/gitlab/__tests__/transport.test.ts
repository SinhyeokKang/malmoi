import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createPublishExecution } from "@/lib/sync/execution";

import { assertIdAddressed, classifyGitLabFailure, createGitLabTransport, GitLabGraphqlError, GitLabHttpError, GITLAB_GRAPHQL, nextPage, projectPath } from "../transport";
import { createFakeGitLabFetch, violatesAddressContract } from "./fake-fetch";

/**
 * 최소 GitLab transport (gitlab-repositories tasks §2 B2) — 숫자 id 주소 · 주입된 fetch 한 번(자체 재시도 0) · 오류 분류.
 */

describe("주소 계약 — 숫자 id로만 부른다", () => {
  it("projectPath는 숫자 id만 받는다 — 이름·인코딩 경로는 주소가 되기 전에 던진다", () => {
    expect(projectPath("87515176")).toBe("/projects/87515176");
    expect(projectPath("87515176", "members/all/42")).toBe("/projects/87515176/members/all/42");
    for (const bad of ["group%2Fapp", "group/app", "app", "0", "-1", "", "1e3", "12 "]) expect(() => projectPath(bad), bad).toThrow();
  });

  it("⚠️ transport는 손으로 만든 이름 주소도 전송 전에 거부한다 — fetch 호출 0회", async () => {
    const fake = createFakeGitLabFetch({});
    const transport = createGitLabTransport("glpat-test", { fetch: fake.fetch });
    await expect(transport.get("/projects/group%2Fapp")).rejects.toThrow(/encoded full path/);
    await expect(transport.get("/projects/group/app/repository/tree")).rejects.toThrow(/numeric id/);
    expect(fake.calls).toEqual([]);
    expect(() => assertIdAddressed("/personal_access_tokens/self")).not.toThrow();
  });

  it("⚠️ 슬래시 든 브랜치 이름은 `/projects/<id>/repository/` 아래 경로·질의에서만 `%2F`로 간다 — 프로젝트 주소의 `%2F`는 여전히 거부다(D22)", async () => {
    const fake = createFakeGitLabFetch({
      "GET /projects/1/repository/branches/malmoi-i18n%2Fsync-app": { status: 200, body: { commit: { id: "c" } } },
      "GET /projects/1/merge_requests": { status: 200, body: [] },
      "GET /projects/1/repository/compare": { status: 200, body: {} },
    });
    const transport = createGitLabTransport("t", { fetch: fake.fetch });
    await transport.get(projectPath("1", `repository/branches/${encodeURIComponent("malmoi-i18n/sync-app")}`));
    await transport.get(projectPath("1", "merge_requests"), { source_branch: "malmoi-i18n/sync-app" });
    await transport.get(projectPath("1", "repository/compare"), { from: "a", to: "release/2.0" });
    expect(fake.calls.map((call) => call.url.href)).toEqual([
      "https://gitlab.com/api/v4/projects/1/repository/branches/malmoi-i18n%2Fsync-app",
      "https://gitlab.com/api/v4/projects/1/merge_requests?source_branch=malmoi-i18n%2Fsync-app",
      "https://gitlab.com/api/v4/projects/1/repository/compare?from=a&to=release%2F2.0",
    ]);
    // 프로젝트 조각·프로젝트 밖 경로·프로젝트 밖 질의의 `%2F`는 전송 전에 거부한다.
    await expect(transport.get("/projects/group%2Fapp/repository/branches/main")).rejects.toThrow(/encoded full path|numeric id/);
    await expect(transport.get("/groups/a%2Fb/projects")).rejects.toThrow(/encoded full path/);
    await expect(transport.get("/projects", { search: "group/app" })).rejects.toThrow(/encoded full path/);
    await expect(transport.get("/projects/1/members/all/a%2Fb")).rejects.toThrow(/encoded full path/);
    expect(fake.calls).toHaveLength(3);
  });

  it("⚠️ 가짜 fetch의 주소 계약도 같은 규칙이다 — 두 겹 중 하나만 느슨해져도 red", () => {
    const at = (href: string) => violatesAddressContract(new URL(href), null);
    expect(at("https://gitlab.com/api/v4/projects/1/repository/branches/a%2Fb")).toBe(false);
    expect(at("https://gitlab.com/api/v4/projects/1/merge_requests?source_branch=a%2Fb")).toBe(false);
    expect(at("https://gitlab.com/api/v4/projects/group%2Fapp")).toBe(true);
    expect(at("https://gitlab.com/api/v4/projects/1/members/all/a%2Fb")).toBe(true);
    expect(at("https://gitlab.com/api/v4/projects?search=a%2Fb")).toBe(true);
    expect(at("https://gitlab.com/api/v4/projects/app/repository/tree")).toBe(true);
    expect(violatesAddressContract(new URL(GITLAB_GRAPHQL), JSON.stringify({ query: "{ project(fullPath: \"a/b\") { id } }" }))).toBe(true);
  });

  it("⚠️ 가짜 fetch가 `%2F`·`fullPath`를 받으면 red다 — 계약이 공허하지 않다", async () => {
    const fake = createFakeGitLabFetch({ "GET /projects/1": { status: 200, body: {} } });
    await expect(fake.fetch("https://gitlab.com/api/v4/projects/group%2Fapp")).rejects.toThrow(/address contract/);
    await expect(fake.fetch("https://gitlab.com/api/graphql", { method: "POST", body: JSON.stringify({ query: "{ project(fullPath: \"a/b\") { id } }" }) })).rejects.toThrow(/address contract/);
  });

  it("⚠️ 점 세그먼트로 다른 project id에 닿는 경로 등 정규화가 바꾸는 경로는 전송 전에 막는다 — fetch 호출 0회(audit A8)", async () => {
    const fake = createFakeGitLabFetch({});
    const transport = createGitLabTransport("t", { fetch: fake.fetch });
    // `new URL`이 `..`·`%2e%2e`를 정규화해 `/projects/2/…`가 된다 — 전송 전 문자열 가드는 `/projects/1/repository/…`로 본다.
    // 점 세그먼트만이 아니다 — 인코딩 안 된 공백·`#`처럼 정규화가 경로를 바꾸는 호출부 실수도 같은 가드가 막는다.
    for (const path of ["/projects/1/repository/../../2/repository/commits", "/projects/1/repository/%2e%2e/%2E%2E/2/repository/commits", "/projects/1/./repository/tree", "/projects/1/repository/branches/a b", "/projects/1/repository/branches/a#b"]) {
      await expect(transport.get(path), path).rejects.toThrow(/normalization changed the path/);
      await expect(transport.send("POST", path, { body: {} }), path).rejects.toThrow(/normalization changed the path/);
    }
    expect(fake.calls).toEqual([]);
  });

  it("GitLab.com API 주소로 부르고 토큰은 헤더에만 싣는다 — URL·질의에 토큰이 없다", async () => {
    const fake = createFakeGitLabFetch({ "GET /projects/87515176": { status: 200, body: { id: 87515176 } } });
    const transport = createGitLabTransport("glpat-secret-value", { fetch: fake.fetch });
    const response = await transport.get(projectPath("87515176"), { simple: "true" });
    expect(response.body).toEqual({ id: 87515176 });
    const [call] = fake.calls;
    expect(call?.url.origin + call!.url.pathname).toBe("https://gitlab.com/api/v4/projects/87515176");
    expect(call?.url.searchParams.get("simple")).toBe("true");
    expect(call?.url.href).not.toContain("glpat-secret-value");
    expect(call?.headers.get("PRIVATE-TOKEN")).toBe("glpat-secret-value");
    expect(call?.method).toBe("GET");
  });
});

describe("실패 — 자체 재시도 0, 오류 분류", () => {
  it("실패 응답은 한 번만 보낸다 — 5xx·429에도 다시 부르지 않는다", async () => {
    for (const status of [500, 502, 429]) {
      const fake = createFakeGitLabFetch({ "GET /user": { status } });
      await expect(createGitLabTransport("t", { fetch: fake.fetch }).get("/user")).rejects.toBeInstanceOf(GitLabHttpError);
      expect(fake.calls).toHaveLength(1);
    }
  });

  it("⚠️ 401은 재인가다 — `unavailable`로 접지 않는다(복구 컨트롤 0개 화면 금지, POSTMORTEM 2026-09-19)", () => {
    expect(classifyGitLabFailure(new GitLabHttpError("/user", 401, false))).toBe("reauthorize");
  });

  it("403 insufficient_scope와 그 밖의 403을 가른다", async () => {
    const fake = createFakeGitLabFetch({
      "GET /user": { status: 403, body: { error: "insufficient_scope", error_description: "The request requires higher privileges" } },
      "GET /projects/1": { status: 403, body: { message: "403 Forbidden" } },
    });
    const transport = createGitLabTransport("t", { fetch: fake.fetch });
    const scope = await transport.get("/user").catch((error: unknown) => error);
    const other = await transport.get("/projects/1").catch((error: unknown) => error);
    expect(classifyGitLabFailure(scope)).toBe("scope-missing");
    expect(classifyGitLabFailure(other)).toBe("forbidden");
  });

  it("⚠️ 404는 접근 상실이다 — '없다'로 단정하지 않는다(GitLab도 권한 없음을 404로 숨긴다)", () => {
    expect(classifyGitLabFailure(new GitLabHttpError("/projects/1", 404, false))).toBe("not-found");
  });

  it("429·5xx·네트워크·모르는 값은 일시 장애다", () => {
    for (const status of [429, 500, 502, 503, 504]) expect(classifyGitLabFailure(new GitLabHttpError("/user", status, false)), String(status)).toBe("unavailable");
    expect(classifyGitLabFailure(new TypeError("fetch failed"))).toBe("unavailable");
    expect(classifyGitLabFailure("boom")).toBe("unavailable");
  });

  it("오류 메시지는 경로와 상태뿐이다 — 응답 본문·토큰을 싣지 않는다", async () => {
    const fake = createFakeGitLabFetch({ "GET /projects/1": { status: 500, body: { runners_token: "GR1348941leak" } } });
    const error = await createGitLabTransport("glpat-x", { fetch: fake.fetch }).get("/projects/1").catch((caught: unknown) => caught);
    expect(String(error)).toBe("GitLabHttpError: GitLab GET /projects/1 responded 500");
    const write = await createGitLabTransport("glpat-x", { fetch: createFakeGitLabFetch({ "POST /projects/1/merge_requests": { status: 409, body: { message: ["Another open merge request already exists"] } } }).fetch })
      .send("POST", "/projects/1/merge_requests", { body: { title: "glpat-x" } }).catch((caught: unknown) => caught);
    expect(String(write)).toBe("GitLabHttpError: GitLab POST /projects/1/merge_requests responded 409");
    expect(String(error)).not.toMatch(/runners_token|GR1348941|glpat-x/);
  });

  it("주입된 fetch를 쓴다 — Publish 실행 수명(`execution.fetch()`)이 여기로 들어온다", async () => {
    let used = 0;
    const fetch = (async () => { used += 1; return new Response("{}", { status: 200 }); }) as typeof globalThis.fetch;
    await createGitLabTransport("t", { fetch }).get("/user");
    expect(used).toBe(1);
  });
});

describe("쓰기·GraphQL — 같은 주입점, 자체 재시도 0", () => {
  it("send는 메서드·JSON 본문을 한 번 보내고 토큰은 헤더에만 싣는다 · 204는 본문 null", async () => {
    const fake = createFakeGitLabFetch({
      "PUT /projects/1/merge_requests/3": { status: 200, body: { iid: 3 } },
      "DELETE /projects/1/repository/branches/a%2Fb": { status: 204 },
    });
    const transport = createGitLabTransport("glpat-w", { fetch: fake.fetch });
    expect((await transport.send("PUT", projectPath("1", "merge_requests/3"), { body: { state_event: "close" } })).body).toEqual({ iid: 3 });
    expect((await transport.send("DELETE", projectPath("1", `repository/branches/${encodeURIComponent("a/b")}`))).body).toBeNull();
    expect(fake.calls.map((call) => [call.method, call.body, call.headers.get("PRIVATE-TOKEN"), call.headers.get("content-type")])).toEqual([
      ["PUT", JSON.stringify({ state_event: "close" }), "glpat-w", "application/json"],
      ["DELETE", null, "glpat-w", null],
    ]);
  });

  it("⚠️ 쓰기 실패(5xx)도 다시 보내지 않는다 — 애매한 5xx 뒤 MR POST가 두 번 나가면 중복 MR이다", async () => {
    const fake = createFakeGitLabFetch({ "POST /projects/1/merge_requests": { status: 502 } });
    await expect(createGitLabTransport("t", { fetch: fake.fetch }).send("POST", projectPath("1", "merge_requests"), { body: {} })).rejects.toBeInstanceOf(GitLabHttpError);
    expect(fake.calls).toHaveLength(1);
  });

  it("GraphQL은 /api/graphql POST 하나이고 errors가 실리면 던진다(장애 — 빈 결과로 접지 않는다)", async () => {
    const ok = createFakeGitLabFetch({ "POST /api/graphql": { status: 200, body: { data: { projects: { nodes: [] } } } } });
    expect(await createGitLabTransport("t", { fetch: ok.fetch }).graphql("query { projects(ids: $ids) { nodes { id } } }", { ids: ["gid://gitlab/Project/1"] })).toEqual({ projects: { nodes: [] } });
    expect(ok.calls[0]?.url.href).toBe(GITLAB_GRAPHQL);
    expect(JSON.parse(ok.calls[0]!.body!)).toEqual({ query: "query { projects(ids: $ids) { nodes { id } } }", variables: { ids: ["gid://gitlab/Project/1"] } });
    const failed = createFakeGitLabFetch({ "POST /api/graphql": { status: 200, body: { errors: [{ message: "complexity" }], data: null } } });
    const error = await createGitLabTransport("t", { fetch: failed.fetch }).graphql("query { x }", {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitLabGraphqlError);
    expect(classifyGitLabFailure(error)).toBe("unavailable");
    await expect(createGitLabTransport("t", { fetch: createFakeGitLabFetch({}).fetch }).graphql("{ project(fullPath: \"a/b\") { id } }", {})).rejects.toThrow(/fullPath/);
  });

  it("⚠️ Publish 실행 수명(`execution.fetch()`)을 주면 비GET이 쓰기로 세어진다 — GET만 부르면 세어지지 않는다", async () => {
    const execution = createPublishExecution();
    const fake = createFakeGitLabFetch({ "GET /projects/1": { status: 200, body: { id: 1 } }, "POST /projects/1/repository/commits": { status: 201, body: { id: "c" } } });
    const transport = createGitLabTransport("t", { fetch: execution.fetch(fake.fetch) });
    await transport.get(projectPath("1"));
    expect(execution.mutationDispatched).toBe(false);
    await transport.send("POST", projectPath("1", "repository/commits"), { body: {} });
    expect(execution.mutationDispatched).toBe(true);
  });
});

/**
 * **리다이렉트를 따라가지 않는다** (audit A1). fetch 기본값 `follow`는 3xx를 따라가며 `PRIVATE-TOKEN`을 그대로 싣는다 — undici는 cross-origin에서
 * `Authorization`만 지운다. 다른 origin이면 PAT가 그 호스트로, 같은 origin이면 다른 project id로 간다(`assertIdAddressed`는 전송 전에 한 번만 본다).
 * 가짜 fetch는 리다이렉트를 흉내 내지 못하므로 **실제 fetch + 로컬 서버 둘**로 잰다 — 주입 fetch는 gitlab.com 주소를 첫 서버로 옮기기만 하고 `init`을
 * 그대로 넘긴다.
 */
describe("리다이렉트 — 따라가지 않고 일시 장애로 던진다", () => {
  type Seen = { url: string; token: string | undefined };
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  async function listen(handler: (request: IncomingMessage, seen: Seen[]) => { status: number; location?: string }): Promise<{ origin: string; seen: Seen[] }> {
    const seen: Seen[] = [];
    const server = createServer((request, response) => {
      seen.push({ url: request.url ?? "", token: request.headers["private-token"] as string | undefined });
      request.resume();
      const { status, location } = handler(request, seen);
      response.writeHead(status, location === undefined ? { "Content-Type": "application/json" } : { Location: location });
      response.end(location === undefined ? "{}" : "");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
  }

  /** gitlab.com 주소를 로컬 서버로 옮기는 주입 fetch — `init`(redirect 옵션 포함)은 손대지 않는다. */
  function routedTo(origin: string): typeof fetch {
    return ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return globalThis.fetch(`${origin}${url.pathname}${url.search}`, init);
    }) as typeof fetch;
  }

  it("⚠️ 다른 origin으로 가는 3xx(301·302·307·308)에 PAT가 실려 나가지 않는다 — 두 번째 요청 0, `unavailable`", async () => {
    const elsewhere = await listen(() => ({ status: 200 }));
    for (const status of [301, 302, 307, 308]) {
      const gitlab = await listen(() => ({ status, location: `${elsewhere.origin}/steal` }));
      const transport = createGitLabTransport("glpat-redirect-secret", { fetch: routedTo(gitlab.origin) });
      const read = await transport.get(projectPath("1")).catch((error: unknown) => error);
      const write = await transport.send("POST", projectPath("1", "repository/commits"), { body: { branch: "b" } }).catch((error: unknown) => error);
      const graph = await transport.graphql("query($ids: [ID!]) { projects(ids: $ids) { nodes { id } } }", { ids: ["gid://gitlab/Project/1"] }).catch((error: unknown) => error);
      for (const error of [read, write, graph]) {
        expect(error, String(status)).toBeInstanceOf(Error);
        expect(classifyGitLabFailure(error), String(status)).toBe("unavailable");
      }
      expect(gitlab.seen, String(status)).toHaveLength(3);
    }
    expect(elsewhere.seen).toEqual([]);
  });

  it("⚠️ 같은 origin의 다른 project id로 가는 3xx도 따라가지 않는다 — 주소 규칙(불변식 11 첫 층)이 리다이렉트에도 선다", async () => {
    const gitlab = await listen((request) => (request.url?.startsWith("/api/v4/projects/1") ? { status: 307, location: "/api/v4/projects/2/repository/commits" } : { status: 200 }));
    const transport = createGitLabTransport("glpat-redirect-secret", { fetch: routedTo(gitlab.origin) });
    const error = await transport.send("POST", projectPath("1", "repository/commits"), { body: {} }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(classifyGitLabFailure(error)).toBe("unavailable");
    expect(gitlab.seen.map((seen) => seen.url)).toEqual(["/api/v4/projects/1/repository/commits"]);
  });
});

describe("nextPage — 오프셋 페이지", () => {
  it("빈 값·없음은 마지막 페이지다", () => {
    expect(nextPage(new Headers({ "x-next-page": "3" }))).toBe("3");
    expect(nextPage(new Headers({ "x-next-page": "" }))).toBeNull();
    expect(nextPage(new Headers())).toBeNull();
  });
});
