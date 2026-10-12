import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { openGitLabToken, sealGitLabToken, validateTokenWriteKey } from "@/lib/credentials/storage";
import { logFailure } from "@/lib/github-connect/log";
import { createGitLabTransport } from "@/lib/gitlab/transport";

import type { GitLabTokenError } from "./errors";
import { isTokenShaped, planGitLabUser, planPatVerification, type RemoteResult } from "./verify";

/**
 * **계정 GitLab 연결** (gitlab-repositories design §2 "GitLab 연결" · tasks §2 B2) — PAT 하나를 사용자당 하나 봉해 두고, 프로젝트는 그 행을
 * 참조만 한다(`Project.gitlabConnectionId`). 판정은 `./verify`의 순수 함수이고 여기는 읽기·검증 호출·쓰기와 경합만 다룬다.
 *
 * ⚠️ **원문 PAT는 이 모듈 밖으로 돌려주지 않는다** — 화면·응답·로그·사건 어디에도 싣지 않는다(spec 완료 조건 11). 원문을 여는 것은
 * `openGitLabConnection` 하나이고 그 소비자는 리포 I/O(`lib/repo-host`·`lib/onboarding-run/access.ts`)뿐이다.
 * ⚠️ **연결 경로는 GET만 부른다** — 검증은 `/personal_access_tokens/self`·`/user`다. 쓰기는 프로젝트가 참조하는 연결의 PAT로 리포 I/O가
 * 한다(`credential-separation.test.ts`가 상시로 센다).
 */

export type GitLabConnectionView = { username: string; expiresAt: Date | null; scopes: string[]; updatedAt: Date };

export type VerifiedToken = { gitlabUserId: string; username: string; scopes: string[]; expiresAt: Date | null };

export type VerifyResult = { status: "ok"; token: VerifiedToken } | { status: Exclude<GitLabTokenError, "account-mismatch"> | "unavailable" };

async function remote(work: () => Promise<{ body: unknown }>): Promise<RemoteResult> {
  try {
    return { ok: true, body: (await work()).body };
  } catch (error) {
    return { ok: false, error };
  }
}

/** PAT 검증 — `/self`로 활성·스코프·종류를, `/user`로 사용자명을 읽는다. 원격 실패는 로그에만 남긴다(분류만, 본문 없음). */
export async function verifyGitLabToken(token: string, options: { fetch?: typeof fetch } = {}): Promise<VerifyResult> {
  const transport = createGitLabTransport(token, options);
  const self = await remote(() => transport.get("/personal_access_tokens/self"));
  if (!self.ok) logFailure("gitlab-verify", self.error);
  const verdict = planPatVerification(self);
  if (verdict.status !== "ok") return { status: verdict.status };
  const user = await remote(() => transport.get("/user"));
  if (!user.ok) logFailure("gitlab-user", user.error);
  const named = planGitLabUser(user, verdict.gitlabUserId);
  if (named.status !== "ok") return { status: named.status };
  return { status: "ok", token: { gitlabUserId: verdict.gitlabUserId, username: named.username, scopes: verdict.scopes, expiresAt: verdict.expiresAt } };
}

export type ConnectGitLabResult =
  | { ok: true; connection: GitLabConnectionView }
  | { ok: false; error: GitLabTokenError | "unavailable" | "invalid input" };

/**
 * PAT 입력·교체 — **연결이 없으면 만들고, 있으면 같은 GitLab 계정일 때만 토큰을 바꾼다**(D19). 교체는 연결 id를 유지하므로 참조하는 프로젝트
 * 전부가 다음 쓰기부터 새 토큰을 쓴다(시안 G8).
 *
 * ⚠️ **다른 GitLab 계정의 PAT로 교체하지 않는다**(D19) — 참조 프로젝트 전부의 쓰기 명의가 Maintainer 재검사 없이 바뀐다. Disconnect 뒤 Connect다.
 * ⚠️ **쓰기는 조건부다** — 검증(초 단위 왕복) 동안 다른 탭이 연결을 해제·교체했을 수 있다. 읽은 계정 id를 `where`에 넣어 진 쪽의 count가 0이면
 * 다시 판정한다(`acceptInvitation`·`ensureUserToken`과 같은 형).
 */
export async function connectGitLabAccount(
  prisma: PrismaClient,
  userId: string,
  rawToken: string,
  options: { fetch?: typeof fetch } = {},
): Promise<ConnectGitLabResult> {
  const token = rawToken.trim();
  if (!isTokenShaped(token)) return { ok: false, error: "invalid input" };
  // 봉할 수 없으면 원격을 부르기 전에 멈춘다 — 검증만 하고 저장에서 죽으면 사용자는 토큰이 틀렸다고 믿는다.
  validateTokenWriteKey();
  const verified = await verifyGitLabToken(token, options);
  if (verified.status !== "ok") return { ok: false, error: verified.status };
  const { gitlabUserId, username, scopes, expiresAt } = verified.token;
  const sealed = sealGitLabToken(token, { userId });

  try {
    const existing = await prisma.gitLabConnection.findUnique({ where: { userId }, select: { gitlabUserId: true } });
    if (existing !== null && existing.gitlabUserId !== gitlabUserId) return { ok: false, error: "account-mismatch" };
    const row = existing === null
      ? await prisma.gitLabConnection.create({ data: { userId, token: sealed, gitlabUserId, username, scopes, expiresAt }, select: VIEW })
      : await replace(prisma, userId, gitlabUserId, { token: sealed, username, scopes, expiresAt });
    if (row === null) return { ok: false, error: "unavailable" };
    return { ok: true, connection: row };
  } catch (error) {
    // 동시에 들어온 첫 연결이 이겼다(userId unique) — 그 행이 같은 계정이면 이 토큰으로 바꾸고, 아니면 mismatch다.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const row = await replace(prisma, userId, gitlabUserId, { token: sealed, username, scopes, expiresAt });
      return row === null ? { ok: false, error: "account-mismatch" } : { ok: true, connection: row };
    }
    logFailure("gitlab-connect", error);
    return { ok: false, error: "unavailable" };
  }
}

const VIEW = { username: true, expiresAt: true, scopes: true, updatedAt: true } as const;

async function replace(
  prisma: PrismaClient,
  userId: string,
  gitlabUserId: string,
  data: { token: string; username: string; scopes: string[]; expiresAt: Date | null },
): Promise<GitLabConnectionView | null> {
  // ⚠️ `where`에 계정 id — 판정과 쓰기 사이에 다른 계정으로 바뀐 행을 덮지 않는다.
  const written = await prisma.gitLabConnection.updateMany({ where: { userId, gitlabUserId }, data });
  if (written.count === 0) return null;
  return prisma.gitLabConnection.findUnique({ where: { userId }, select: VIEW });
}

/**
 * 연결 해제 — 행을 지우면 FK `SetNull`이 참조하던 프로젝트를 **같은 문장에서** 끊는다(`Disconnected`). 연결자가 떠나면 끊긴다(design §2 7단계).
 * 원격(GitLab의 토큰 철회)은 부르지 않는다 — 토큰의 주인은 사용자이고, GitLab에서 직접 철회한다.
 */
export async function disconnectGitLabAccount(prisma: PrismaClient, userId: string): Promise<{ ok: true; disconnected: boolean } | { ok: false; error: "unavailable" }> {
  try {
    const removed = await prisma.gitLabConnection.deleteMany({ where: { userId } });
    return { ok: true, disconnected: removed.count > 0 };
  } catch (error) {
    logFailure("gitlab-disconnect", error);
    return { ok: false, error: "unavailable" };
  }
}

/** `/account`·①의 표시용. 토큰은 싣지 않는다. 조회 실패는 던진다 — "연결 없음"으로 접으면 멀쩡한 연결을 다시 만들게 한다. */
export async function readGitLabConnection(prisma: PrismaClient, userId: string): Promise<GitLabConnectionView | null> {
  return prisma.gitLabConnection.findUnique({ where: { userId }, select: VIEW });
}

export type OpenedGitLabConnection = { connectionId: string; userId: string; gitlabUserId: string; expiresAt: Date | null; token: string };

/**
 * **원문 PAT를 여는 유일한 자리.** 호출자 권한은 `{ userId }`(호출자 자신의 연결), 프로젝트 I/O는 `{ connectionId }`(프로젝트가 참조하는
 * 연결)로 연다 — ⚠️ **쓰기 경로가 호출자의 연결을 고르면 다른 사람의 프로젝트에 내 명의로 쓴다**(design §5).
 * 행이 없으면 `null`이다. 봉투가 안 열리면(키 회전 사고) 던진다 — 연결 없음으로 접지 않는다.
 */
export async function openGitLabConnection(prisma: PrismaClient, by: { userId: string } | { connectionId: string }): Promise<OpenedGitLabConnection | null> {
  const row = await prisma.gitLabConnection.findUnique({
    where: "userId" in by ? { userId: by.userId } : { id: by.connectionId },
    select: { id: true, userId: true, gitlabUserId: true, expiresAt: true, token: true },
  });
  if (row === null) return null;
  return { connectionId: row.id, userId: row.userId, gitlabUserId: row.gitlabUserId, expiresAt: row.expiresAt, token: openGitLabToken(row.token, { userId: row.userId }) };
}
