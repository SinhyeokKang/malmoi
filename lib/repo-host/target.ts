/**
 * 리포 호스트 경계의 **입력** (gitlab-repositories design §3 "공통 경계"). `Project` 행에서 만든다 — 클라이언트 입력이 아니다.
 *
 * 판정은 이 파일에만 있고 I/O는 `./index`가 호스트별 구현으로 보낸다. 호스트가 늘면 각 `switch (….host)`에 갈래 하나를 더한다 —
 * `default`의 `never` 검사가 빠뜨린 자리를 typecheck로 알린다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이고, 설정·번역 화면의 첫 렌더 판정도 이것을 쓴다.
 */

export type RepoHost = "github" | "gitlab";

/** 저장된 `Project.repoHost` 문자열 → 호스트. 모르는 값은 `null`이다 — 연결 증거가 없는 것으로 읽는다(fail-closed). */
export function parseRepoHost(value: string): RepoHost | null {
  return value === "github" || value === "gitlab" ? value : null;
}

/**
 * 경계의 입력. `owner`/`name`은 저장된 **주소**이고 `repositoryId`가 정체성이다(sec-audit-2 #34) — I/O 구현은 주소로 부르되 쓰기 전에
 * 정체성을 대조한다(GitHub은 `pinnedOctokit`이 토큰을 그 id 하나로 좁힌다).
 *
 * GitLab: `owner` = namespace 전체(`group/subgroup`), `name` = path, `repositoryId` = GitLab project id(문자열),
 * `connectionId` = 프로젝트가 참조하는 **계정 GitLab 연결**(`Project.gitlabConnectionId`). ⚠️ GitLab I/O는 주소가 아니라 숫자 id로만 부른다
 * (design §3 — PAT에는 리포를 좁히는 층이 없어 그것이 첫 층이다).
 */
export type RepoTarget =
  | { host: "github"; owner: string; name: string; installationId: string; repositoryId: string }
  | { host: "gitlab"; owner: string; name: string; repositoryId: string; connectionId: string };

/** `repoTargetOf`가 읽는 열. select가 이것을 빠뜨리면 typecheck가 잡는다 — select에는 `REPO_COLUMNS`를 펼친다. */
export type ProjectRepoColumns = {
  repoHost: string;
  repoOwner: string;
  repoName: string;
  installationId: string | null;
  repositoryId: string | null;
  gitlabConnectionId: string | null;
};

/** Prisma select 조각 — 연결 판정·지문·메모 키의 재료가 한 벌이다. */
export const REPO_COLUMNS = {
  repoHost: true, repoOwner: true, repoName: true, installationId: true, repositoryId: true, gitlabConnectionId: true,
} as const satisfies Record<keyof ProjectRepoColumns, true>;

/**
 * 연결 증거가 없으면 **이유를 가른다** — GitHub `unpinned`(설치 id 있음 + 리포 id 없음)와 `not-connected`를 한 null로 접지 않는다.
 * sec-audit-2 #34의 [Reconnect] 안내가 `unpinned` 갈래에 선다(설정·Home·번역·MCP). GitLab에는 `unpinned`가 없다 — 리포 id는 생성 때 항상 있다.
 *
 * `connection-removed` — **GitLab 프로젝트의 연결 참조가 비었다**(연결자가 떠났거나 연결을 해제했다 — D21). 모든 화면에서 `Disconnected`(재연결 필요,
 * GitHub `unpinned`과 같은 톤)이고 복구 컨트롤은 GitLab 재연결(`reconnectGitLabRepository`)이다. `not-connected`(설치 없음 — Connect)로 접으면
 * 설정이 GitHub Connect를 띄우고 그 Action은 GitLab을 거부한다 — 복구 컨트롤이 실패만 내는 화면이 된다(POSTMORTEM 2026-09-19).
 */
export type RepoTargetResult = { status: "ok"; target: RepoTarget } | { status: "not-connected" } | { status: "unpinned" } | { status: "connection-removed" };

/**
 * 저장된 열 → 경계 입력. GitHub 판정은 `storedConnection`(`lib/github-connect/health.ts`)과 같다 — 연결 화면의 첫 렌더와 I/O가 한 판정을 지난다
 * (`target.test.ts`가 둘을 대조한다).
 */
export function repoTargetOf(project: ProjectRepoColumns): RepoTargetResult {
  const host = parseRepoHost(project.repoHost);
  switch (host) {
    case "github":
      if (project.installationId === null) return { status: "not-connected" };
      // ⚠️ 리포 id가 없으면 이름만 맞는 행이다 — `createGitClient`가 쓰기 직전에 거부하므로 여기서 ok를 주면 화면이 초록인데 Publish만 죽는다.
      if (project.repositoryId === null) return { status: "unpinned" };
      return {
        status: "ok",
        target: { host, owner: project.repoOwner, name: project.repoName, installationId: project.installationId, repositoryId: project.repositoryId },
      };
    case "gitlab":
      // 리포 id 없는 GitLab 행은 만들어지지 않는다 — 있다면 손상이고, 이름으로 부르지 않으므로 연결 없음으로 읽는다.
      if (project.repositoryId === null) return { status: "not-connected" };
      // ⚠️ 참조가 비면 끊긴 것이다 — 연결자가 떠났거나 연결을 해제했다(`Project.gitlabConnectionId`). 남은 OWNER가 재연결한다(D21).
      if (project.gitlabConnectionId === null) return { status: "connection-removed" };
      return {
        status: "ok",
        target: { host, owner: project.repoOwner, name: project.repoName, repositoryId: project.repositoryId, connectionId: project.gitlabConnectionId },
      };
    case null:
      return { status: "not-connected" };
    default:
      return unreachable(host);
  }
}

/**
 * readiness의 첫 조건 — "연결된 적이 있는 프로젝트인가"(`setup`이 아닌가). GitHub은 설치 id만 본다(리포 id 없는 `unpinned`도 연결된 것이다 —
 * readiness가 아니라 [Reconnect]가 고친다). GitLab은 **고정된 리포 id**다 — GitLab 행은 생성 때 항상 연결된 채로 태어나고(`setup`이 없다),
 * 연결자가 떠나 참조가 빈 것은 GitHub `unpinned`와 같은 자리다: readiness는 그대로 두고 `repoConnectionPinned`가 [Reconnect]를 세운다.
 * ⚠️ 참조가 빈 GitLab 프로젝트를 `setup`으로 접으면 Home이 서지 않고 목록이 "설정 중"을 말한다 — 끊긴 연결을 고칠 자리가 사라진다.
 * 모르는 호스트는 연결 없음이다.
 */
export function hasRepoConnection(project: Pick<ProjectRepoColumns, "repoHost" | "installationId" | "repositoryId">): boolean {
  const host = parseRepoHost(project.repoHost);
  switch (host) {
    case "github":
      return project.installationId !== null;
    case "gitlab":
      return project.repositoryId !== null;
    case null:
      return false;
    default:
      return unreachable(host);
  }
}

/**
 * 연결이 **지금 쓸 수 있게** 고정돼 있는가 — `repoTargetOf(project).status === "ok"`와 같은 판정에서 주소만 뺐다(목록 행은 주소를 들지 않는다).
 * 아니면 목록·Home이 [Reconnect]를 말한다(GitHub 리포 id 미고정 · GitLab 연결 참조 비움). 야간 대상도 이것으로 거른다 — 연결 없이 돌면 매일 밤
 * 같은 실패가 쌓인다.
 */
export function repoConnectionPinned(project: Pick<ProjectRepoColumns, "repoHost" | "installationId" | "repositoryId" | "gitlabConnectionId">): boolean {
  const host = parseRepoHost(project.repoHost);
  switch (host) {
    case "github":
      return project.installationId !== null && project.repositoryId !== null;
    case "gitlab":
      return project.gitlabConnectionId !== null && project.repositoryId !== null;
    case null:
      return false;
    default:
      return unreachable(host);
  }
}

/**
 * 호출자 리포 권한(`checkRepoAccess`)의 대상 — **주소만** 든다. 연결 증거가 없다: 묻는 것은 "이 사람이 이 리포를 볼 수 있나"이지 프로젝트의
 * 연결이 아니다. GitLab은 숫자 project id 하나다(이름으로 찾지 않는다).
 */
export type RepoLocator = { host: "github"; owner: string; name: string } | { host: "gitlab"; repositoryId: string };

/** 저장된 프로젝트 행 → 권한 확인 대상. 재적재·소스 추가·재탐지·토큰 회전·설정 브랜치 목록이 같은 행에서 같은 대상을 만든다. */
export function repoLocatorOf(project: Pick<ProjectRepoColumns, "repoHost" | "repoOwner" | "repoName" | "repositoryId">): RepoLocator {
  const host = parseRepoHost(project.repoHost);
  switch (host) {
    case "github":
      return { host, owner: project.repoOwner, name: project.repoName };
    case "gitlab":
      // ⚠️ 이름으로 대신 찾지 않는다 — 리포 id 없는 GitLab 행은 생성 경로에 없다(불변식 위반).
      if (project.repositoryId === null) throw new Error("unreachable: GitLab project without repository id");
      return { host, repositoryId: project.repositoryId };
    case null:
      throw new Error(`unreachable: unknown repository host ${JSON.stringify(project.repoHost)}`);
    default:
      return unreachable(host);
  }
}

/** 호스트 + 불변 리포 id. 연결 증거는 보지 않는다 — 호출자의 연결이 프로젝트가 참조하는 연결과 다른 것이 정상인 호스트가 있다. */
export function sameRepository(a: { host: RepoHost; repositoryId: string }, b: { host: RepoHost; repositoryId: string }): boolean {
  return a.host === b.host && a.repositoryId === b.repositoryId;
}

/**
 * **잠금 안 재검증용** — 호스트·리포 id·연결 증거까지 같아야 같다. 재연결(GitHub 재설치 · GitLab 다른 OWNER의 재연결)을 감지한다.
 * 주소(owner/name)·base는 보지 않는다 — 호출부가 저장된 설정과 함께 따로 대조한다.
 */
export function sameRepoTarget(a: RepoTarget, b: RepoTarget): boolean {
  if (!sameRepository(a, b)) return false;
  switch (a.host) {
    case "github":
      return b.host === "github" && a.installationId === b.installationId;
    case "gitlab":
      return b.host === "gitlab" && a.connectionId === b.connectionId;
    default:
      return unreachable(a);
  }
}

/** 호출자 접근 결과(`checkRepoAccess`의 ok)에서 경계가 쓰는 부분. GitLab `connectionId`는 **호출자 자신의** 계정 연결이다. */
export type AccessedRepository =
  | { host: "github"; repositoryId: string; installationId: string; repoOwner: string; repoName: string }
  | { host: "gitlab"; repositoryId: string; connectionId: string; repoOwner: string; repoName: string };

/**
 * 호출자 접근 결과(`checkRepoAccess`) 대 프로젝트 — 온보딩의 재적재·소스 추가·재탐지가 부른다(D16).
 *
 * ⚠️ **GitHub은 설치 id까지 본다.** App 설치는 계정 단위라 호출자가 보는 설치가 곧 프로젝트가 써야 할 설치다 — 재설치 뒤 저장된 옛 설치로
 * 읽으러 가면 토큰 발급에서 죽는다(`ingest-failed`). 지금처럼 `repo-replaced`·`repo-forbidden`으로 멈추는 것이 정직하다.
 * ⚠️ **GitLab은 `sameRepository`만 본다** — 연결이 사람 단위라 연결자가 아닌 OWNER의 연결은 프로젝트 참조와 다른 것이 정상이다. 연결 id를
 * 기계적으로 비교하면 연결자가 아닌 OWNER의 Sync·소스 추가가 전부 `repo-replaced`가 된다.
 */
export function sameAccessedRepository(access: AccessedRepository, project: RepoTarget): boolean {
  if (!sameRepository(access, project)) return false;
  switch (access.host) {
    case "github":
      return project.host === "github" && access.installationId === project.installationId;
    case "gitlab":
      return true;
    default:
      return unreachable(access);
  }
}

/**
 * **새 리포**(①·탐지·샘플·생성) — 호출자 자신의 접근으로 연다. 아직 프로젝트가 없으므로 열 수 있는 연결은 호출자의 것뿐이다.
 * 확인한 접근의 주소(GitHub 리네임 뒤의 정규 이름)를 쓴다.
 *
 * ⚠️ **연결된 프로젝트 경로에서 부르지 않는다** — GitLab `connectionId`가 **호출자의** 연결이라, 연결자가 아닌 OWNER의 소스 추가·재탐지·브랜치 목록이
 * 조용히 그 OWNER 명의로 읽힌다(design §3 "접근 확인 뒤 I/O는 프로젝트 참조 연결로"). 그 경로는 `projectReadTarget`이다.
 * 부르는 자리는 새 리포 경로 다섯뿐이다 — `credential-separation.test.ts`가 `파일#함수` 허용 목록으로 센다(D21).
 */
export function newRepoTarget(access: AccessedRepository): RepoTarget {
  switch (access.host) {
    case "github":
      return githubTargetOf(access);
    case "gitlab":
      return { host: "gitlab", owner: access.repoOwner, name: access.repoName, repositoryId: access.repositoryId, connectionId: access.connectionId };
    default:
      return unreachable(access);
  }
}

function githubTargetOf(access: Extract<AccessedRepository, { host: "github" }>): RepoTarget {
  return { host: "github", owner: access.repoOwner, name: access.repoName, installationId: access.installationId, repositoryId: access.repositoryId };
}

/**
 * **연결된 프로젝트**(소스 추가·재탐지·설정 브랜치 목록) — `sameAccessedRepository`를 지난 뒤에만 부른다.
 * GitHub은 지금처럼 확인한 접근의 값으로 연다(대조를 지나 같은 설치·리포다 — design §3 ⑤). GitLab은 **프로젝트가 참조하는 연결**로 연다 —
 * 호출자의 연결로 열면 연결자가 아닌 사람의 명의로 읽는다(design §3 "공통 경계").
 */
export function projectReadTarget(access: AccessedRepository, project: RepoTarget): RepoTarget {
  switch (access.host) {
    case "github":
      return githubTargetOf(access);
    case "gitlab":
      return project;
    default:
      return unreachable(access);
  }
}

/**
 * 샘플 확인값(`lib/onboarding/sample-confirmation.ts`)이 묶는 **연결 증거** — 서명한 연결과 소비하는 연결이 같아야 한다.
 * 호스트 접두가 둘을 가른다(같은 문자열 id가 두 호스트에 있을 수 있다).
 */
export function connectionEvidence(target: RepoTarget): string {
  switch (target.host) {
    case "github":
      return `github:${target.installationId}`;
    case "gitlab":
      return `gitlab:${target.connectionId}`;
    default:
      return unreachable(target);
  }
}

/** `switch (….host)`의 `default` — 호스트가 늘었는데 갈래를 빠뜨리면 `never`가 아니라서 typecheck가 red다. */
export function unreachable(value: never): never {
  throw new Error(`unknown repository host: ${JSON.stringify(value)}`);
}
