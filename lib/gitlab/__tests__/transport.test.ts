import { describe, expect, it } from "vitest";

import { assertIdAddressed, classifyGitLabFailure, createGitLabTransport, GitLabHttpError, nextPage, projectPath } from "../transport";
import { createFakeGitLabFetch } from "./fake-fetch";

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
    expect(String(error)).not.toMatch(/runners_token|GR1348941|glpat-x/);
  });

  it("주입된 fetch를 쓴다 — Publish 실행 수명(`execution.fetch()`)이 여기로 들어온다", async () => {
    let used = 0;
    const fetch = (async () => { used += 1; return new Response("{}", { status: 200 }); }) as typeof globalThis.fetch;
    await createGitLabTransport("t", { fetch }).get("/user");
    expect(used).toBe(1);
  });
});

describe("nextPage — 오프셋 페이지", () => {
  it("빈 값·없음은 마지막 페이지다", () => {
    expect(nextPage(new Headers({ "x-next-page": "3" }))).toBe("3");
    expect(nextPage(new Headers({ "x-next-page": "" }))).toBeNull();
    expect(nextPage(new Headers())).toBeNull();
  });
});
