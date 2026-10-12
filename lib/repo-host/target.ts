/**
 * 리포 호스트 경계의 **입력** (gitlab-repositories design §3 "공통 경계"). `Project` 행에서 만든다 — 클라이언트 입력이 아니다.
 *
 * 판정은 이 파일에만 있고 I/O는 `./index`가 호스트별 구현으로 보낸다. 호스트가 늘면 각 `switch (….host)`에 갈래 하나를 더한다 —
 * `default`의 `never` 검사가 빠뜨린 자리를 typecheck로 알린다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이고, 설정·번역 화면의 첫 렌더 판정도 이것을 쓴다.
 */

export type RepoHost = "github";

/**
 * 경계의 입력. `owner`/`name`은 저장된 **주소**이고 `repositoryId`가 정체성이다(sec-audit-2 #34) — I/O 구현은 주소로 부르되 쓰기 전에
 * 정체성을 대조한다(GitHub은 `pinnedOctokit`이 토큰을 그 id 하나로 좁힌다).
 */
export type RepoTarget = { host: "github"; owner: string; name: string; installationId: string; repositoryId: string };

/** `repoTargetOf`가 읽는 열. select가 이것을 빠뜨리면 typecheck가 잡는다. */
export type ProjectRepoColumns = { repoOwner: string; repoName: string; installationId: string | null; repositoryId: string | null };

/**
 * 연결 증거가 없으면 **이유를 가른다** — GitHub `unpinned`(설치 id 있음 + 리포 id 없음)와 `not-connected`를 한 null로 접지 않는다.
 * sec-audit-2 #34의 [Reconnect] 안내가 `unpinned` 갈래에 선다(설정·Home·번역·MCP).
 */
export type RepoTargetResult = { status: "ok"; target: RepoTarget } | { status: "not-connected" } | { status: "unpinned" };

/**
 * 저장된 열 → 경계 입력. 판정은 `storedConnection`(`lib/github-connect/health.ts`)과 같다 — 연결 화면의 첫 렌더와 I/O가 한 판정을 지난다
 * (`target.test.ts`가 둘을 대조한다).
 */
export function repoTargetOf(project: ProjectRepoColumns): RepoTargetResult {
  if (project.installationId === null) return { status: "not-connected" };
  // ⚠️ 리포 id가 없으면 이름만 맞는 행이다 — `createGitClient`가 쓰기 직전에 거부하므로 여기서 ok를 주면 화면이 초록인데 Publish만 죽는다.
  if (project.repositoryId === null) return { status: "unpinned" };
  return {
    status: "ok",
    target: { host: "github", owner: project.repoOwner, name: project.repoName, installationId: project.installationId, repositoryId: project.repositoryId },
  };
}

/**
 * 호출자 리포 권한(`checkRepoAccess`)의 대상 — **주소만** 든다. 연결 증거가 없다: 묻는 것은 "이 사람이 이 리포를 볼 수 있나"이지 프로젝트의
 * 연결이 아니다.
 */
export type RepoLocator = { host: "github"; owner: string; name: string };

/** 저장된 프로젝트 행 → 권한 확인 대상. 재적재·소스 추가·재탐지·토큰 회전·설정 브랜치 목록이 같은 행에서 같은 대상을 만든다. */
export function repoLocatorOf(project: Pick<ProjectRepoColumns, "repoOwner" | "repoName">): RepoLocator {
  return { host: "github", owner: project.repoOwner, name: project.repoName };
}

/** 호스트 + 불변 리포 id. 연결 증거는 보지 않는다 — 호출자의 연결이 프로젝트가 참조하는 연결과 다른 것이 정상인 호스트가 있다. */
export function sameRepository(a: { host: RepoHost; repositoryId: string }, b: { host: RepoHost; repositoryId: string }): boolean {
  return a.host === b.host && a.repositoryId === b.repositoryId;
}

/**
 * **잠금 안 재검증용** — 호스트·리포 id·연결 증거까지 같아야 같다. 재연결(재설치)을 감지한다.
 * 주소(owner/name)·base는 보지 않는다 — 호출부가 저장된 설정과 함께 따로 대조한다.
 */
export function sameRepoTarget(a: RepoTarget, b: RepoTarget): boolean {
  if (!sameRepository(a, b)) return false;
  switch (a.host) {
    case "github":
      return a.installationId === b.installationId;
    default:
      return unreachable(a.host);
  }
}

/**
 * 호출자 접근 결과(`checkRepoAccess`) 대 프로젝트 — 온보딩의 재적재·소스 추가·재탐지가 부른다(D16).
 *
 * ⚠️ **GitHub은 설치 id까지 본다.** App 설치는 계정 단위라 호출자가 보는 설치가 곧 프로젝트가 써야 할 설치다 — 재설치 뒤 저장된 옛 설치로
 * 읽으러 가면 토큰 발급에서 죽는다(`ingest-failed`). 지금처럼 `repo-replaced`·`repo-forbidden`으로 멈추는 것이 정직하다.
 * 연결이 사람 단위인 호스트는 `sameRepository`만 본다 — 기계적으로 연결 증거를 비교하면 연결자가 아닌 OWNER가 전부 거부된다.
 */
export function sameAccessedRepository(access: { host: "github"; repositoryId: string; installationId: string }, project: RepoTarget): boolean {
  if (!sameRepository(access, project)) return false;
  switch (access.host) {
    case "github":
      return project.host === "github" && access.installationId === project.installationId;
    default:
      return unreachable(access.host);
  }
}

/** `switch (….host)`의 `default` — 호스트가 늘었는데 갈래를 빠뜨리면 `never`가 아니라서 typecheck가 red다. */
export function unreachable(value: never): never {
  throw new Error(`unknown repository host: ${JSON.stringify(value)}`);
}
