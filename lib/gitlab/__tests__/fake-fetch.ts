/**
 * **GitLab 가짜 fetch** (gitlab-repositories — tasks §2 B2 "주소 계약" · §3 가짜 클라이언트). 테스트가 transport에 주입한다. 받은 요청을 기록하고,
 * 경로마다 정한 응답을 준다.
 *
 * ⚠️ **주소 계약이 여기 산다** — `/projects/` 다음 조각이 숫자가 아니거나(인코딩한 `namespace%2Fpath` 포함), 본문에 `fullPath`가 있으면 **응답 대신
 * 던진다**. 이름 주소는 이름이 재사용·이전되면 남의 프로젝트를 부른다(PAT에는 리포를 좁히는 층이 없다 — design §5). 이 가짜를 쓰는 모든 테스트가 그
 * 규칙을 함께 잰다(POSTMORTEM 2026-09-27 — 주소 모양만 보고 대상이 옳은지 안 본 형).
 * `%2F`는 **브랜치·파일 이름**으로만 허용한다(D22) — `/projects/<id>/repository/` 아래 경로와, 그 아래·MR 목록의 질의 값(`source_branch=`·`to=`).
 * 거기 밖의 `%2F`는 프로젝트 주소를 이름으로 만들려는 시도다.
 */
export type FakeCall = { method: string; url: URL; headers: Headers; body: string | null };

export type FakeRoute =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | ((call: FakeCall) => Promise<Response> | Response);

/** `/projects/<id>/…`의 숫자 id와 나머지. 프로젝트 주소가 아니면 `null`. */
const PROJECT_SCOPED = /^\/projects\/([^/?]+)(\/.*)?$/;

/** 주소 계약 — transport의 `assertIdAddressed`와 **따로** 쓴 사본이다(같은 규칙을 두 겹으로 잰다 — 한쪽이 느슨해져도 다른 쪽이 red다). */
export function violatesAddressContract(url: URL, body: string | null): boolean {
  if (body !== null && body.includes("fullPath")) return true;
  const path = url.pathname.replace(/^\/api\/v4/, "");
  const scoped = PROJECT_SCOPED.exec(path);
  if (scoped !== null && !/^[1-9][0-9]*$/.test(scoped[1]!)) return true;
  const rest = scoped?.[2] ?? "";
  const named = rest.startsWith("/repository/") ? rest.slice("/repository/".length) : "";
  const unnamed = scoped === null ? path : `/projects/${scoped[1]}${rest.slice(0, rest.length - named.length)}`;
  if (/%2f/i.test(unnamed)) return true;
  const queryNamesBranches = scoped !== null && /^\/(repository|merge_requests)(\/|$)/.test(rest);
  return !queryNamesBranches && /%2f/i.test(url.search);
}

export function createFakeGitLabFetch(routes: Record<string, FakeRoute>) {
  const calls: FakeCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? init.body : null;
    const method = (init?.method ?? "GET").toUpperCase();
    const call = { method, url, headers: new Headers(init?.headers), body };
    calls.push(call);
    if (violatesAddressContract(url, body)) throw new Error(`address contract: GitLab must be addressed by numeric id — ${url.pathname}`);
    const key = `${method} ${url.pathname.replace(/^\/api\/v4/, "")}`;
    const route = routes[key];
    if (route === undefined) throw new Error(`unexpected GitLab request: ${key}`);
    if (typeof route === "function") return route(call);
    return json(route.body, route.status, route.headers);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** 응답 하나. `body`가 `undefined`면 본문 없음(204 등)이다. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
