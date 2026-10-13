import { z } from "zod";

import type { RepoLocator } from "@/lib/repo-host/target";

/**
 * **새 리포(①)의 입력 → 권한 확인 대상** (gitlab-repositories). GitHub은 지금처럼 `{ owner, repo }`(웹·MCP 입력 그대로), GitLab은 숫자 project id
 * 하나다 — ⚠️ **GitLab을 이름으로 받지 않는다**: 이름은 재사용·이전되고 PAT에는 리포를 좁히는 층이 없어 id가 첫 층이다(design §5).
 * 판별자는 `host: "gitlab"`이고, 없으면 GitHub이다 — 기존 호출부(웹 GitHub 탭·MCP 도구)의 입력 모양이 그대로 통한다.
 */
export const GitHubRepoInput = z.object({ owner: z.string().min(1), repo: z.string().min(1) });
export const GitLabRepoInput = z.object({ host: z.literal("gitlab"), repositoryId: z.string().regex(/^[1-9][0-9]{0,18}$/) });

export type NewRepoInput = z.infer<typeof GitHubRepoInput> | z.infer<typeof GitLabRepoInput>;

export function newRepoLocator(input: NewRepoInput): RepoLocator {
  return "host" in input ? { host: "gitlab", repositoryId: input.repositoryId } : { host: "github", owner: input.owner, name: input.repo };
}
