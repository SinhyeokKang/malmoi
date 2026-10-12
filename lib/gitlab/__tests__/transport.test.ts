import { describe, expect, it } from "vitest";

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

describe("nextPage — 오프셋 페이지", () => {
  it("빈 값·없음은 마지막 페이지다", () => {
    expect(nextPage(new Headers({ "x-next-page": "3" }))).toBe("3");
    expect(nextPage(new Headers({ "x-next-page": "" }))).toBeNull();
    expect(nextPage(new Headers())).toBeNull();
  });
});
