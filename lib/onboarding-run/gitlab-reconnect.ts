import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AccessError } from "@/lib/auth/message";
import { lockProjectAccess } from "@/lib/auth/lock";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import { logFailure } from "@/lib/github-connect/log";
import { REPO_COLUMNS } from "@/lib/repo-host/target";

import { checkRepoAccess, type OnboardFailure } from "./access";

/**
 * **GitLab 프로젝트 재연결** (gitlab-repositories design §2 "GitLab 연결" 6·7단계 · tasks §2 B2). 프로젝트의 연결 참조를 **호출자 자신의**
 * 계정 GitLab 연결로 바꾼다 — 그 순간부터 Sync·Publish·야간의 쓰기 명의가 이 사람이다(화면이 그 문장을 먼저 보인다 — 시안 G6c, E-ui).
 * GitHub `connectRepository`의 짝이고, 그 Action은 GitLab 행을 거부한다(호스트 가드).
 *
 * 인가: `project:settings`(OWNER) → 호출자 PAT로 **쓰기 권한**(Maintainer — `checkRepoAccess`의 `requirePush: true`)을 본다. 서버가 이미 가진
 * 연결(옛 연결자)의 존재만으로 호출자의 권한을 인정하지 않는다. 리포는 저장된 숫자 id로만 묻는다 — 클라이언트는 slug 하나만 보낸다.
 *
 * ⚠️ **쓰기는 잠금 뒤 조건부다** — 원격 왕복(초 단위) 동안 다른 OWNER가 재연결했거나 리포가 바뀌었으면 `where`(`repoHost`·`repositoryId`·
 * 읽은 참조)가 0행이 되어 `repo-forbidden`이다(`connectRepository`의 P2025와 같은 판정).
 */
export type GitLabReconnectResult = { ok: true } | { ok: false; error: AccessError | OnboardFailure };

export async function reconnectGitLabProject(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<GitLabReconnectResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  // 보관 = Restore만 — 거부될 요청이 GitLab을 부르지 않게 먼저 막는다. 경합 창은 잠금 안 판정이 닫는다.
  if (access.archived) return { ok: false, error: "archived" };
  const { projectId } = access;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: REPO_COLUMNS });
  if (project === null) return { ok: false, error: "not-found" };
  // GitHub 프로젝트는 `connectRepository`가 든다 — 여기서 GitLab 참조를 박으면 혼종 행이 된다.
  if (project.repoHost !== "gitlab" || project.repositoryId === null) return { ok: false, error: "invalid input" };

  const repo = await checkRepoAccess(prisma, userId, { host: "gitlab", repositoryId: project.repositoryId }, { requirePush: true });
  if (repo.status !== "ok") return { ok: false, error: repo.error };
  // 숫자 id로 물었으니 같은 리포다 — 그래도 호스트 갈래를 좁혀 연결 id를 읽는다.
  if (repo.host !== "gitlab") return { ok: false, error: "repo-forbidden" };

  try {
    const locked = await prisma.$transaction(async (tx) => {
      // GitLab 왕복 동안 강등·보관이 끝났을 수 있다 — 잠금 뒤 다시 본다.
      const locked = await lockProjectAccess(tx, { projectId, userId, permission: "project:settings", credential });
      if (locked.status !== "ok") return locked;
      const written = await tx.project.updateMany({
        where: { id: projectId, repoHost: "gitlab", repositoryId: project.repositoryId, gitlabConnectionId: project.gitlabConnectionId },
        // 주소는 확인한 현재 값으로 — GitLab에서 옮긴 프로젝트도 지금 경로로 보인다(정체성은 숫자 id다).
        data: { gitlabConnectionId: repo.connectionId, repoOwner: repo.repoOwner, repoName: repo.repoName },
      });
      if (written.count === 0) return { status: "conflict" as const };
      // ⚠️ 연결 id·GitLab 사용자 id를 싣지 않는다 — 자격증명 경계의 값이다. 사람이 읽을 사실은 "어느 리포에 붙였나"뿐이다(GitHub 재연결과 같다).
      await recordEvent(tx, {
        projectId,
        subtype: "settings.repositoryConnected",
        actor: { kind: "USER", userId },
        scope: "project-wide",
        payload: { kind: "SETTINGS", field: "repository", value: { before: `${project.repoOwner}/${project.repoName}`, after: `${repo.repoOwner}/${repo.repoName}` } },
      });
      return locked;
    });
    if (locked.status === "conflict") return { ok: false, error: "repo-forbidden" };
    if (locked.status !== "ok") return { ok: false, error: locked.status };
  } catch (error) {
    logFailure("gitlab-reconnect", error);
    return { ok: false, error: "unavailable" };
  }
  return { ok: true };
}
