import "server-only";
import { GITLAB_CI_RELEASE, renderProjectGitlabCiYaml } from "@/lib/onboarding/gitlab-ci";
import { renderProjectWorkflowYaml, workflowApiUrl, type WorkflowSurface } from "@/lib/onboarding/workflow";
import type { RepoHost } from "@/lib/repo-host/target";

/**
 * **CI 파일 — 리포 호스트별 경로** (gitlab-repositories tasks §4·§5). GitHub은 Actions 워크플로, GitLab은 `.gitlab-ci.yml`이다.
 * 생성기는 둘 다 `lib/onboarding/`의 것을 그대로 부른다 — YAML을 손으로 만들지 않는다. ⚠️ **집이 여기 하나다** — MCP 도구(`get_workflow`·
 * `create_project`)와 화면(설정 CI 모달·온보딩 ⑤)이 둘 다 이것을 import한다(R-Eui 🟡4 — 화면이 MCP 층에 기대던 역방향을 걷었다).
 *
 * ⚠️ **GitLab 파일은 릴리스 SHA가 40자 hex일 때만 낸다**(R-D1 계약). 그 전의 생성 job은 `MALMOI_I18N_PUSH_SHA: "unreleased"`를 박아
 * 대조에서 실패한다 — 붙이면 red가 되는 파일을 에이전트에게 건네지 않는다. 화면도 같은 조건으로 고른다(E-ui).
 */
export const GITHUB_WORKFLOW_PATH = ".github/workflows/malmoi-i18n.yml";
export const GITLAB_CI_PATH = ".gitlab-ci.yml";

export function gitlabCiReleased(): boolean {
  const { sha } = GITLAB_CI_RELEASE;
  return sha !== null && /^[0-9a-f]{40}$/.test(sha);
}

/** 활성 표면이 없거나 GitLab 원본이 발행 전이면 `null`이다 — 호출부가 그 갈래의 문장(`not-ready`·`workflow-unavailable`)을 고른다. */
export function ciFileOf(repoHost: RepoHost, input: { slug: string; baseBranch: string; surfaces: readonly WorkflowSurface[]; origin: string | null }): { path: string; yaml: string } | null {
  if (input.surfaces.length === 0) return null;
  if (repoHost === "gitlab" && !gitlabCiReleased()) return null;
  // `api-url`은 이 요청이 들어온 앱을 가리킨다 — 프로덕션·모르는 origin은 생략(`workflowApiUrl`).
  const apiUrl = workflowApiUrl(input.origin);
  const render = { slug: input.slug, baseBranch: input.baseBranch, surfaces: input.surfaces, ...(apiUrl === undefined ? {} : { apiUrl }) };
  return repoHost === "gitlab"
    ? { path: GITLAB_CI_PATH, yaml: renderProjectGitlabCiYaml(render) }
    : { path: GITHUB_WORKFLOW_PATH, yaml: renderProjectWorkflowYaml(render) };
}
