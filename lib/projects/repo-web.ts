/**
 * **리포 호스트의 웹 주소** (gitlab-repositories tasks §5 · consumers.md §3.4). 화면이 `https://github.com/${owner}/${repo}`를 손으로 조립하던 자리
 * (Home 메타 · Logs · 설정 · `/projects` compare · 코드 참조)가 이 한 곳을 지난다 — 호스트가 늘면 여기만 는다.
 *
 * GitLab: `owner`는 namespace 전체(`group/subgroup`)이고 리포 아래 경로는 `/-/` 아래다(`/-/compare`·`/-/blob`). 모르는 호스트 값은 GitHub이다(열 기본값).
 * ⚠️ **경로 조각을 인코딩하지 않는다** — 소비자가 이미 안전한 경로(`planCodeRef`의 정규화)·저장된 이름만 넘긴다(그 계약은 각 소비자 주석).
 * ⚠️ **잎이다** — 클라이언트(`/projects` 띠)가 값으로 읽는다.
 */
const ORIGIN = { github: "https://github.com", gitlab: "https://gitlab.com" } as const;

function isGitLab(host: string): boolean {
  return host === "gitlab";
}

export function repoWebUrl(host: string, owner: string, name: string): string {
  return `${isGitLab(host) ? ORIGIN.gitlab : ORIGIN.github}/${owner}/${name}`;
}

export function repoCompareUrl(host: string, owner: string, name: string, from: string, to: string): string {
  return `${repoWebUrl(host, owner, name)}${isGitLab(host) ? "/-" : ""}/compare/${from}...${to}`;
}

export function repoBlobUrl(host: string, owner: string, name: string, sha: string, path: string, line: number): string {
  return `${repoWebUrl(host, owner, name)}${isGitLab(host) ? "/-" : ""}/blob/${sha}/${path}#L${line}`;
}
