// ⚠️ **`server-only`를 일부러 붙이지 않았다** — `lib/github.ts`와 같은 이유다(tsx 스모크 스크립트가 프로덕션 경로를 그대로 지난다).
import { httpStatus } from "@/lib/failure";

/**
 * **GitLab REST의 최소 transport** (gitlab-repositories design §3 · tasks §2 B2). 읽기(GET)만 여기 있고, 쓰기·Publish·MR은 커밋 C가
 * 같은 주입점 위에 얹는다.
 *
 * ⚠️ **숫자 id로만 주소한다** — `/projects/<id>/…`. 인코딩한 `namespace%2Fpath` 주소는 이름이 재사용·이전되면 남의 프로젝트를 부른다.
 * PAT에는 토큰을 리포 하나로 좁히는 층이 없어(GitHub `pinnedOctokit`과 다르다) **이 주소 규칙이 첫 층이다**(design §5 · 불변식 11).
 * `get`이 주소 모양을 보고 어기면 전송 전에 던진다 — 호출부의 실수가 원격 호출이 되지 않는다.
 *
 * ⚠️ **자체 재시도·자체 fetch가 없다** — 주입된 `fetch` 한 번이다. Publish는 실행 수명의 `execution.fetch()`를 넘긴다(240초 예산·비GET은
 * 쓰기로 셈 — POSTMORTEM 2026-10-09). 재시도가 끼면 애매한 5xx 뒤 MR POST가 두 번 나간다.
 *
 * ⚠️ **응답을 통째로 로그·저장하지 않는다** — `GET /projects/:id`에 러너 등록 토큰(`runners_token`)이 실린다. 호출부는 필요한 필드만 뽑는다.
 * 오류 메시지에도 본문을 싣지 않는다(경로와 상태 코드뿐이다). 토큰은 헤더에만 있다.
 */

/** GitLab.com 한정(spec §5) — 코드 상수이고 환경변수가 아니다(design §5 "새 환경변수는 없다"). */
export const GITLAB_ORIGIN = "https://gitlab.com";
export const GITLAB_API = `${GITLAB_ORIGIN}/api/v4`;

/**
 * 원격이 실패 상태로 답했다. `status`는 `httpStatus()`(`lib/failure.ts`)가 읽는 이름이다 — 저장 오류 코드 분류(`lib/sync/plan.ts`)가
 * 호스트 중립으로 이것을 본다. `insufficientScope`는 403 본문의 `insufficient_scope`다(그 밖의 403과 복구가 다르다).
 */
export class GitLabHttpError extends Error {
  readonly status: number;
  readonly insufficientScope: boolean;

  constructor(path: string, status: number, insufficientScope: boolean) {
    super(`GitLab GET ${path} responded ${status}`);
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
 * 주소 규칙 — 전송 직전에 본다. `%2F`(인코딩한 namespace 경로)가 있거나 `/projects/` 뒤가 숫자가 아니면 거부한다.
 * ⚠️ `projectPath`를 지나지 않은 문자열도 여기서 막힌다(`get("/projects/group%2Fapp")`).
 */
export function assertIdAddressed(path: string): void {
  if (/%2f/i.test(path)) throw new Error("GitLab paths must not address a project by its encoded full path");
  const match = /^\/projects\/([^/?]+)/.exec(path);
  if (match !== null && !isGitLabProjectId(match[1]!)) throw new Error("GitLab project must be addressed by its numeric id");
}

export type GitLabResponse = { body: unknown; headers: Headers };

export type GitLabTransport = {
  /** 읽기 하나. 2xx가 아니면 `GitLabHttpError`, 네트워크 실패는 fetch의 오류 그대로 던진다(`classifyGitLabFailure` → `unavailable`). */
  get(path: string, query?: Readonly<Record<string, string>>): Promise<GitLabResponse>;
};

/**
 * @param options.fetch Publish 실행이 넘기는 `execution.fetch()`. 없으면 전역 fetch다 — 렌더 중 조회는 `lib/github-wait.ts`의 공유 마감으로 감싼다.
 */
export function createGitLabTransport(token: string, options: { fetch?: typeof fetch } = {}): GitLabTransport {
  const send = options.fetch ?? globalThis.fetch;
  return {
    async get(path, query) {
      assertIdAddressed(path);
      const url = new URL(`${GITLAB_API}${path}`);
      for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
      const response = await send(url, { method: "GET", headers: { "PRIVATE-TOKEN": token, Accept: "application/json" } });
      if (!response.ok) {
        // 본문은 403의 스코프 판정에만 읽는다 — 메시지에 싣지 않는다.
        const insufficientScope = response.status === 403 && (await response.text().catch(() => "")).includes("insufficient_scope");
        throw new GitLabHttpError(path, response.status, insufficientScope);
      }
      return { body: await response.json(), headers: response.headers };
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
