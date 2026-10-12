// ⚠️ **`server-only`를 일부러 붙이지 않았다** — `lib/github.ts`와 같은 이유다(tsx 스모크 스크립트가 프로덕션 경로를 그대로 지난다).
import { httpStatus } from "@/lib/failure";

/**
 * **GitLab REST·GraphQL transport** (gitlab-repositories design §3 · tasks §2 B2·§3). 읽기(`get`)·쓰기(`send`)·GraphQL(`graphql`)이 같은 주입점
 * 하나를 지난다 — 판정은 없다(`./plan`).
 *
 * ⚠️ **숫자 id로만 주소한다** — `/projects/<id>/…`. 인코딩한 `namespace%2Fpath` 주소는 이름이 재사용·이전되면 남의 프로젝트를 부른다.
 * PAT에는 토큰을 리포 하나로 좁히는 층이 없어(GitHub `pinnedOctokit`과 다르다) **이 주소 규칙이 첫 층이다**(design §5 · 불변식 11).
 * `get`이 주소 모양을 보고 어기면 전송 전에 던진다 — 호출부의 실수가 원격 호출이 되지 않는다.
 *
 * ⚠️ **자체 재시도·자체 fetch가 없다** — 주입된 `fetch` 한 번이다. Publish는 실행 수명의 `execution.fetch()`를 넘긴다(240초 예산·비GET은
 * 쓰기로 셈 — POSTMORTEM 2026-10-09). 재시도가 끼면 애매한 5xx 뒤 MR POST가 두 번 나간다.
 *
 * ⚠️ **리다이렉트를 따라가지 않는다**(`redirect: "error"` — audit A1). fetch 기본값 `follow`는 3xx를 따라가며 `PRIVATE-TOKEN`을 그대로 싣는다(undici는
 * cross-origin에서 `Authorization`만 지운다) — 다른 origin이면 PAT가 그 호스트로, 같은 origin이면 다른 project id로 간다. 숫자 id 주소에 3xx가 올
 * 정상 경로는 없으므로 fetch가 던지는 `TypeError`(상태 없음)를 그대로 올린다 — `classifyGitLabFailure`가 `unavailable`로 읽는다.
 *
 * ⚠️ **응답을 통째로 로그·저장하지 않는다** — `GET /projects/:id`에 러너 등록 토큰(`runners_token`)이 실린다. 호출부는 필요한 필드만 뽑는다.
 * 오류 메시지에도 본문을 싣지 않는다(경로와 상태 코드뿐이다). 토큰은 헤더에만 있다.
 */

/** GitLab.com 한정(spec §5) — 코드 상수이고 환경변수가 아니다(design §5 "새 환경변수는 없다"). */
export const GITLAB_ORIGIN = "https://gitlab.com";
export const GITLAB_API = `${GITLAB_ORIGIN}/api/v4`;
export const GITLAB_GRAPHQL = `${GITLAB_ORIGIN}/api/graphql`;
const API_PATH = new URL(GITLAB_API).pathname;

/**
 * 원격이 실패 상태로 답했다. `status`는 `httpStatus()`(`lib/failure.ts`)가 읽는 이름이다 — 저장 오류 코드 분류(`lib/sync/plan.ts`)가
 * 호스트 중립으로 이것을 본다. `insufficientScope`는 403 본문의 `insufficient_scope`다(그 밖의 403과 복구가 다르다).
 */
export class GitLabHttpError extends Error {
  readonly status: number;
  readonly insufficientScope: boolean;

  constructor(path: string, status: number, insufficientScope: boolean, method = "GET") {
    super(`GitLab ${method} ${path} responded ${status}`);
    this.name = "GitLabHttpError";
    this.status = status;
    this.insufficientScope = insufficientScope;
  }
}

/**
 * 원격 실패 → 복구 갈래 (design §3 "권한 분류").
 *
 * - `reauthorize` — 401. 무효·만료·철회가 같은 본문이라 가르지 않는다. ⚠️ **`unavailable`로 접지 않는다** — 영구 상태를 "잠시 뒤 다시"로
 *   안내하면 복구 컨트롤 없이 같은 버튼만 누른다(POSTMORTEM 2026-09-19).
 * - `scope-missing` — 403 `insufficient_scope`. 레거시 PAT의 스코프는 바꿀 수 없으니 철회와 같은 복구(토큰 교체)다.
 * - `forbidden` — 그 밖의 403(보관된 프로젝트의 쓰기·보호 브랜치 등). 재시도하지 않는다.
 * - `not-found` — 404. ⚠️ GitLab도 권한 없음을 404로 숨긴다 — "없다"로 단정하지 않고 **접근 상실**로 읽는다.
 * - `unavailable` — 429·5xx·네트워크·그 밖. 일시 장애다.
 */
/**
 * GraphQL이 200으로 `errors`를 실어 답했다(복잡도 초과·권한 등). 상태 코드가 없어 `classifyGitLabFailure`가 `unavailable`로 읽는다 — 크기 조회
 * 실패는 예산 초과가 아니라 `unavailable`이다(design §2 판정). 본문은 싣지 않는다.
 */
export class GitLabGraphqlError extends Error {
  constructor() {
    super("GitLab GraphQL responded with errors");
    this.name = "GitLabGraphqlError";
  }
}

export type GitLabFailure = "reauthorize" | "scope-missing" | "forbidden" | "not-found" | "unavailable";

export function classifyGitLabFailure(error: unknown): GitLabFailure {
  const status = httpStatus(error);
  if (status === 401) return "reauthorize";
  if (status === 403) return error instanceof GitLabHttpError && error.insufficientScope ? "scope-missing" : "forbidden";
  if (status === 404) return "not-found";
  return "unavailable";
}

/** 숫자 project id. 이 모양이 아니면 주소를 만들지 않는다 — 이름 주소의 우회로를 닫는다. */
const PROJECT_ID = /^[1-9][0-9]{0,18}$/;

export function isGitLabProjectId(value: string): boolean {
  return PROJECT_ID.test(value);
}

/** `/projects/<id>/<rest>` — 경로를 조립하는 유일한 자리다. `rest`의 동적 조각은 호출부가 `encodeURIComponent`를 지난다. */
export function projectPath(repositoryId: string, rest = ""): string {
  if (!isGitLabProjectId(repositoryId)) throw new Error("GitLab project must be addressed by its numeric id");
  return rest === "" ? `/projects/${repositoryId}` : `/projects/${repositoryId}/${rest}`;
}

/**
 * 주소 규칙 — 전송 직전에 본다(D22). `/projects/` 뒤가 숫자가 아니면 거부한다. `%2F`(인코딩한 슬래시)는 **브랜치·파일 이름**으로만 허용한다 —
 * `/projects/<id>/repository/` 아래 경로 조각과, 그 아래·MR 목록(`/projects/<id>/merge_requests`)의 질의 값(`source_branch=`·`to=`). 그 밖의
 * `%2F`·`/`는 프로젝트를 이름(`namespace%2Fpath`)으로 부르려는 모양이다.
 * ⚠️ `projectPath`를 지나지 않은 문자열도 여기서 막힌다(`get("/projects/group%2Fapp")`).
 */
export function assertIdAddressed(path: string, query: Readonly<Record<string, string>> = {}): void {
  const scoped = /^\/projects\/([^/?]+)(\/.*)?$/.exec(path);
  if (scoped !== null && !isGitLabProjectId(scoped[1]!)) {
    if (/%2f/i.test(scoped[1]!)) throw new Error("GitLab paths must not address a project by its encoded full path");
    throw new Error("GitLab project must be addressed by its numeric id");
  }
  const rest = scoped?.[2] ?? "";
  const unnamed = rest.startsWith("/repository/") ? `/projects/${scoped?.[1]}/repository/` : path;
  if (/%2f/i.test(unnamed)) throw new Error("GitLab paths must not address a project by its encoded full path");
  const namesBranches = scoped !== null && /^\/(repository|merge_requests)(\/|$)/.test(rest);
  if (!namesBranches && Object.values(query).some((value) => value.includes("/") || /%2f/i.test(value))) {
    throw new Error("GitLab paths must not address a project by its encoded full path");
  }
}

/** `body`는 본문이 없으면(204 등) `null`이다. */
export type GitLabResponse = { status: number; body: unknown; headers: Headers };

export type GitLabWriteMethod = "POST" | "PUT" | "DELETE";

export type GitLabTransport = {
  /** 읽기 하나. 2xx가 아니면 `GitLabHttpError`, 네트워크 실패는 fetch의 오류 그대로 던진다(`classifyGitLabFailure` → `unavailable`). */
  get(path: string, query?: Readonly<Record<string, string>>): Promise<GitLabResponse>;
  /**
   * 쓰기 하나(commit·MR 생성·MR 갱신·노트·브랜치 삭제). 실패는 `get`과 같다.
   * ⚠️ **Publish 실행 수명(`execution.fetch()`)을 받은 transport면 이 호출이 쓰기로 세어진다** — 그 뒤 실패는 결과 미확인이다(POSTMORTEM 2026-10-09).
   */
  send(method: GitLabWriteMethod, path: string, options?: { query?: Readonly<Record<string, string>>; body?: unknown }): Promise<GitLabResponse>;
  /**
   * GraphQL 질의 하나 → `data`. `errors`가 실리면 `GitLabGraphqlError`.
   * ⚠️ **POST다 — Publish 실행 안에서 부르지 않는다**(쓰기로 세어져 그 뒤 실패가 `execution-uncertain`이 된다 — design §3 `sizes`). 소비자는 적재뿐이다.
   * ⚠️ 숫자 id 주소만 — `fullPath`가 든 질의는 전송 전에 던진다.
   */
  graphql(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown>;
};

/**
 * @param options.fetch Publish 실행이 넘기는 `execution.fetch()`. 없으면 전역 fetch다 — 렌더 중 조회는 `lib/github-wait.ts`의 공유 마감으로 감싼다.
 */
export function createGitLabTransport(token: string, options: { fetch?: typeof fetch } = {}): GitLabTransport {
  const send = options.fetch ?? globalThis.fetch;
  async function call(method: "GET" | GitLabWriteMethod, path: string, query: Readonly<Record<string, string>> = {}, body?: unknown): Promise<GitLabResponse> {
    assertIdAddressed(path, query);
    const url = new URL(`${GITLAB_API}${path}`);
    // `assertIdAddressed`는 정규화 전 문자열을 본다 — `new URL`이 `..`·`%2e%2e`를 접으면 `/projects/1/repository/../../2/…`가 프로젝트 2가 된다(audit A8).
    // 정규화가 경로를 바꿨으면 거부한다(동적 조각은 `encodeURIComponent`를 지나므로 정상 경로는 바뀌지 않는다).
    if (url.pathname !== `${API_PATH}${path}`) throw new Error("GitLab paths must not contain dot segments");
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const headers: Record<string, string> = { "PRIVATE-TOKEN": token, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await send(url, { method, headers, redirect: "error", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      // 본문은 403의 스코프 판정에만 읽는다 — 메시지에 싣지 않는다.
      const insufficientScope = response.status === 403 && (await response.text().catch(() => "")).includes("insufficient_scope");
      throw new GitLabHttpError(path, response.status, insufficientScope, method);
    }
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : JSON.parse(text), headers: response.headers };
  }
  return {
    get: (path, query) => call("GET", path, query),
    send: (method, path, sendOptions = {}) => call(method, path, sendOptions.query, sendOptions.body),
    async graphql(query, variables) {
      if (query.includes("fullPath")) throw new Error("GitLab GraphQL must address projects by numeric id, not fullPath");
      const response = await send(new URL(GITLAB_GRAPHQL), {
        method: "POST",
        headers: { "PRIVATE-TOKEN": token, Accept: "application/json", "Content-Type": "application/json" },
        redirect: "error",
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) throw new GitLabHttpError("/graphql", response.status, false, "POST");
      const parsed: unknown = await response.json();
      if (typeof parsed !== "object" || parsed === null || ("errors" in parsed && parsed.errors !== undefined) || !("data" in parsed)) throw new GitLabGraphqlError();
      return parsed.data;
    },
  };
}

/**
 * 오프셋 페이지의 다음 번호(`x-next-page`). 빈 값이면 마지막 페이지다. ①의 리포 목록이 쓴다 — 큰 트리는 keyset이 맞고 그것은 C의 reader가 든다.
 */
export function nextPage(headers: Headers): string | null {
  const next = headers.get("x-next-page");
  return next === null || next === "" ? null : next;
}
