import type { NewRepoInput } from "@/lib/onboarding-run/locator";
import type { RepoOption } from "@/lib/onboarding/types";

/**
 * ① 리포 행 → Action 입력 (gitlab-repositories). GitHub은 `{ owner, repo }` 그대로, GitLab은 숫자 project id 하나다 —
 * ⚠️ **GitLab을 이름으로 보내지 않는다**(이름은 재사용·이전된다 — `lib/onboarding-run/locator.ts`).
 * 모달의 다섯 호출(브랜치·탐지·샘플·수동 확인·생성)이 이 함수 하나로 입력을 만든다.
 */
export function repoInputOf(repo: RepoOption): NewRepoInput {
  return repo.host === "gitlab" ? { host: "gitlab", repositoryId: repo.repositoryId } : { owner: repo.owner, repo: repo.repo };
}
