import type { OpenImportPr } from "@/lib/import/confirm";
export function parseGithubPrUrl(raw: string | null | undefined, project: { repoOwner: string; repoName: string }): OpenImportPr {
  if (raw === null || raw === undefined) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== "https://github.com" || url.username || url.password) return undefined;
    const parts = url.pathname.split("/");
    if (parts.length !== 5 || parts[1]?.toLowerCase() !== project.repoOwner.toLowerCase() || parts[2]?.toLowerCase() !== project.repoName.toLowerCase() || parts[3] !== "pull" || !/^[1-9][0-9]*$/.test(parts[4] ?? "")) return undefined;
    const number = Number(parts[4]);
    return Number.isSafeInteger(number) ? { number, url: raw } : undefined;
  } catch { return undefined; }
}

/**
 * GitLab MR URL(`https://gitlab.com/<namespace…>/<path>/-/merge_requests/<iid>`) → 번호. 원본 리포(하위 그룹 포함, 대소문자 무시)·origin·양의 안전 정수를
 * 검증한다 — `parseGithubPrUrl`과 같은 규칙이다(gitlab-repositories).
 */
export function parseGitLabMrUrl(raw: string | null | undefined, project: { repoOwner: string; repoName: string }): OpenImportPr {
  if (raw === null || raw === undefined) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== "https://gitlab.com" || url.username || url.password) return undefined;
    const parts = url.pathname.split("/").slice(1);
    const tail = parts.slice(-3);
    if (tail.length !== 3 || tail[0] !== "-" || tail[1] !== "merge_requests" || !/^[1-9][0-9]*$/.test(tail[2] ?? "")) return undefined;
    if (parts.slice(0, -3).join("/").toLowerCase() !== `${project.repoOwner}/${project.repoName}`.toLowerCase()) return undefined;
    const number = Number(tail[2]);
    return Number.isSafeInteger(number) ? { number, url: raw } : undefined;
  } catch { return undefined; }
}

/** 프로젝트 호스트로 고른다. 다른 호스트·모르는 호스트의 링크는 모름(`undefined`)이다 — 남의 호스트 주소를 링크로 내지 않는다. */
export function parseReviewUrl(raw: string | null | undefined, project: { repoHost: string; repoOwner: string; repoName: string }): OpenImportPr {
  if (raw === null || raw === undefined) return raw;
  if (project.repoHost === "github") return parseGithubPrUrl(raw, project);
  if (project.repoHost === "gitlab") return parseGitLabMrUrl(raw, project);
  return undefined;
}
