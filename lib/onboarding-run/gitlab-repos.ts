import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Subject } from "@/lib/auth/subject";
import { logFailure } from "@/lib/github-connect/log";
import { openGitLabConnection } from "@/lib/gitlab-connect/connection";
import { tokenExpired } from "@/lib/gitlab-connect/verify";
import { classifyGitLabFailure, createGitLabTransport, nextPage } from "@/lib/gitlab/transport";

import type { OnboardFailure } from "./access";
import { projectLimitReached } from "./repos";

/**
 * **①의 GitLab 리포 목록** (gitlab-repositories design §2 "GitLab 연결" 4단계) — GitHub `listRepositories`의 짝. 호출자 **자신의** 계정 연결
 * PAT로 `GET /projects?membership=true&min_access_level=40&archived=false`를 끝까지 읽는다(Maintainer 이상 — `permissions.group_access`가 상속을
 * 반영하는지 문서가 없어 필터 쪽을 쓴다). **표시용이다** — 생성(`createProjectFromRepo`)이 제출 시점에 `checkRepoAccess`로 다시 본다.
 *
 * ⚠️ 응답에서 쓰는 것은 id·경로·마지막 활동뿐이다(`simple=true`) — 응답 전문을 로그·저장하지 않는다.
 * ⚠️ 중간 페이지 실패는 목록 전체 실패다 — 잘린 목록을 성공으로 보이지 않는다. 페이지 상한을 넘으면 `truncated`로 말한다.
 */
export type GitLabRepo = { repositoryId: string; fullName: string; owner: string; name: string; lastActivityAt: string | null };

export type GitLabReposResult =
  | { ok: true; repos: GitLabRepo[]; truncated: boolean }
  | { ok: false; error: Extract<OnboardFailure, "limit-reached" | "unavailable" | "gitlab-not-connected" | "gitlab-reconnect"> };

/** 100개씩 20쪽 — 2,000개 넘게 Maintainer인 계정은 목록 대신 검색이 맞다(그때 연다). */
const PER_PAGE = 100;
const MAX_PAGES = 20;

const Row = z.object({ id: z.number().int().positive(), path_with_namespace: z.string().min(1), last_activity_at: z.string().nullable().optional() });

export async function listGitLabRepositories(prisma: PrismaClient, subject: Subject, options: { fetch?: typeof fetch } = {}): Promise<GitLabReposResult> {
  const { userId } = subject;
  // 상한 안내가 연결보다 먼저다 — GitHub ①과 같은 순서·같은 판정(`ownedActiveProjects`·운영자 면제).
  try {
    if (await projectLimitReached(prisma, userId)) return { ok: false, error: "limit-reached" };
  } catch (error) {
    logFailure("gitlab-repos", error);
    return { ok: false, error: "unavailable" };
  }
  const connection = await openGitLabConnection(prisma, { userId }).catch((error: unknown) => {
    logFailure("gitlab-repos", error);
    return "unavailable" as const;
  });
  if (connection === "unavailable") return { ok: false, error: "unavailable" };
  if (connection === null) return { ok: false, error: "gitlab-not-connected" };
  if (tokenExpired(connection.expiresAt, new Date())) return { ok: false, error: "gitlab-reconnect" };

  const transport = createGitLabTransport(connection.token, options);
  const repos: GitLabRepo[] = [];
  let page: string | null = "1";
  let pages = 0;
  try {
    while (page !== null && pages < MAX_PAGES) {
      const response = await transport.get("/projects", {
        membership: "true", min_access_level: "40", archived: "false", simple: "true", order_by: "id", sort: "asc", per_page: String(PER_PAGE), page,
      });
      const rows = z.array(Row).safeParse(response.body);
      if (!rows.success) return { ok: false, error: "unavailable" };
      for (const row of rows.data) {
        const slash = row.path_with_namespace.lastIndexOf("/");
        if (slash <= 0) continue;
        repos.push({ repositoryId: String(row.id), fullName: row.path_with_namespace, owner: row.path_with_namespace.slice(0, slash),
          name: row.path_with_namespace.slice(slash + 1), lastActivityAt: row.last_activity_at ?? null });
      }
      page = nextPage(response.headers);
      pages += 1;
    }
  } catch (error) {
    logFailure("gitlab-repos", error);
    const failure = classifyGitLabFailure(error);
    return { ok: false, error: failure === "reauthorize" || failure === "scope-missing" ? "gitlab-reconnect" : "unavailable" };
  }
  return { ok: true, repos, truncated: page !== null };
}
