/**
 * GitLab 연결의 실패 갈래 (gitlab-repositories — tasks §2 B2). **코드만 여기 있다** — 문구는 사전이 들고 화면 분기는 E-ui가 붙인다
 * (`connectErrorMessage`와 같은 형: `satisfies Record<Union, string>`). 모르는 값은 폴백한다 — 이 갈래도 화면 상태로 실린다.
 *
 * ⚠️ 호스트 중립인 거부(`repo-forbidden`·`repo-read-only`·`unavailable`·`unauthorized`·`invalid input`)는 여기 없다 — GitHub 갈래와 같은
 * 문구를 쓴다(`connectErrorMessage`). 여기 있는 것은 GitLab에만 있는 원인이다.
 */

/** PAT 입력·교체(`connectGitLab`)의 거부 — design §2 "GitLab 연결" 2단계. */
export type GitLabTokenError =
  /** 401 · `active: false` · `revoked: true` — 무효·만료·철회가 같은 본문이라 가르지 않는다. 다시 만들어 붙여 넣는다. */
  | "token-invalid"
  /** fine-grained PAT(`granular`) — 레거시 PAT만 받는다(D13, spec §5 비목표). */
  | "token-fine-grained"
  /** 스코프에 `api`가 없다 — 레거시 PAT의 스코프는 만든 뒤 바꿀 수 없어 새 토큰이다. */
  | "token-scope-missing"
  /** 교체 토큰이 기존 연결과 다른 GitLab 계정의 것이다(D19) — Disconnect 뒤 Connect. */
  | "account-mismatch";

/** 호출자 리포 권한(`checkRepoAccess`의 GitLab 갈래)의 거부. */
export type GitLabAccessError =
  /** 호출자에게 계정 GitLab 연결이 없다 — `/account`나 ①에서 PAT를 붙여 넣는다. */
  | "gitlab-not-connected"
  /** 호출자의 PAT가 만료·철회·스코프 상실(401·403 `insufficient_scope`) — 토큰 교체. */
  | "gitlab-reconnect"
  /** 보관된 GitLab 프로젝트 — 쓰기가 403이다. GitLab에서 보관을 해제한다. */
  | "gitlab-repo-archived"
  /** SHA-256 object format 리포 — blob id가 `git hash-object`(SHA-1)와 다르다(spec §5). */
  | "gitlab-repo-unsupported"
  /**
   * 프로젝트의 GitLab 연결 참조가 비었다(연결자가 떠남·해제) — OWNER가 설정에서 재연결한다. GitHub `repo-not-installed`의 짝. 수동 Sync는 참조가 있어도
   * 토큰 주인의 PAT를 못 쓰면(만료·철회·보관) 이 코드로 거부한다(감사 E4).
   */
  | "gitlab-project-disconnected";

export type GitLabConnectError = GitLabTokenError | GitLabAccessError;

const GITLAB_CONNECT_ERRORS: ReadonlySet<string> = new Set<GitLabConnectError>([
  "token-invalid",
  "token-fine-grained",
  "token-scope-missing",
  "account-mismatch",
  "gitlab-not-connected",
  "gitlab-reconnect",
  "gitlab-repo-archived",
  "gitlab-repo-unsupported",
  "gitlab-project-disconnected",
]);

/**
 * 연결된 프로젝트의 연결 증거가 비었을 때의 거부 — GitHub은 지금 그대로 `repo-not-installed`(App 설치 안내), GitLab은 참조가 빈
 * `gitlab-project-disconnected`(설정에서 재연결)다. 한 코드로 접으면 GitLab 프로젝트에 "App을 설치하라"가 뜬다.
 */
export function projectDisconnected(repoHost: string): "repo-not-installed" | "gitlab-project-disconnected" {
  return repoHost === "gitlab" ? "gitlab-project-disconnected" : "repo-not-installed";
}

export function isGitLabConnectError(value: unknown): value is GitLabConnectError {
  return typeof value === "string" && GITLAB_CONNECT_ERRORS.has(value);
}
