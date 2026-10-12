/**
 * **GitLab 가짜 fetch** (gitlab-repositories — tasks §2 B2 "주소 계약"). 테스트가 transport에 주입한다. 받은 요청을 기록하고, 경로마다 정한 응답을 준다.
 *
 * ⚠️ **주소 계약이 여기 산다** — 받은 URL에 `%2F`(인코딩한 namespace 경로)나 본문에 `fullPath`가 있으면 **응답 대신 던진다**. 이름 주소는 이름이
 * 재사용·이전되면 남의 프로젝트를 부른다(PAT에는 리포를 좁히는 층이 없다 — design §5). 이 가짜를 쓰는 모든 테스트가 그 규칙을 함께 잰다
 * (POSTMORTEM 2026-09-27 — 주소 모양만 보고 대상이 옳은지 안 본 형). C가 쓰기·GraphQL 가짜를 이 위에 얹는다.
 */
export type FakeRoute = { status: number; body?: unknown; headers?: Record<string, string> } | (() => Promise<Response> | Response);

export type FakeCall = { method: string; url: URL; headers: Headers; body: string | null };

export function createFakeGitLabFetch(routes: Record<string, FakeRoute>) {
  const calls: FakeCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? init.body : null;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, headers: new Headers(init?.headers), body });
    if (/%2f/i.test(url.href) || (body !== null && body.includes("fullPath"))) throw new Error(`address contract: GitLab must be addressed by numeric id — ${url.pathname}`);
    const key = `${method} ${url.pathname.replace(/^\/api\/v4/, "")}`;
    const route = routes[key];
    if (route === undefined) throw new Error(`unexpected GitLab request: ${key}`);
    if (typeof route === "function") return route();
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status, headers: { "content-type": "application/json", ...route.headers } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
