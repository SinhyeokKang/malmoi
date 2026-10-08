import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { probeRepo } from "@/lib/github";
import { planRepoConnect, type RepoConnect, type UserRepo } from "@/lib/github-connect/connect-plan";
import { httpStatus } from "@/lib/failure";
import { logFailure } from "@/lib/github-connect/log";
import type { ConnectError } from "@/lib/github-connect/message";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { type InstallationRepo, listInstallationRepos, listUserInstallations } from "@/lib/github-connect/user";
import type { OnboardError } from "@/lib/onboarding/message";

/**
 * **두 GitHub 자격증명이 만나는 코어** (mcp-connector T4-c — design §1.3 · ARCHITECTURE §3.1). 리포 읽기는 App installation 토큰
 * (`openRepoReader`·`probeRepo`), "이 사람이 그 설치를 볼 수 있는가"는 사용자 토큰(`listUserInstallations`·`listInstallationRepos`)이다.
 * Server Action과 MCP 도구가 같은 코어를 부른다 — `credential-separation.test.ts`가 이 루트에 Server Action과 같은 규칙을 건다
 * (둘 다 import 가능, 쓰기는 App 토큰만). `lib/onboarding/`은 여전히 둘 다 모른다.
 *
 * ⚠️ **인가가 GitHub 조회보다 먼저다** — 거부될 요청이 남의 레이트 리밋을 태우지 않는다.
 */

/** 온보딩의 실패는 두 union에서 온다 — `/projects/new`가 `isOnboardError`·`isConnectError` 둘로 읽는다 (§3.6). */
export type OnboardFailure = OnboardError | ConnectError | "invalid input";

/**
 * 목록 조회 실패 → 사유. **401이 있으면 그것이 이긴다** (ARCHITECTURE §6.4): 사용자가 GitHub에서 App
 * 인가를 철회하면 DB 토큰은 아직 만료 전이라 `ensureUserToken`이 `ok`를 주고 **이 GET이 유일한
 * 신호**다. `unavailable`로 접으면 영구 상태를 "잠시 뒤 다시"로 안내해 사용자가 같은 버튼을 무한히
 * 누른다 — 필요한 것은 "GitHub 다시 연결" 버튼이다.
 */
export function listFailure(errors: readonly unknown[]): { ok: false; error: "reauthorize" | "unavailable" } {
  for (const error of errors) logFailure("onboard-repos", error);
  return errors.some((error) => httpStatus(error) === 401)
    ? { ok: false, error: "reauthorize" }
    : { ok: false, error: "unavailable" };
}

/**
 * ARCHITECTURE §6의 3중 검증 — **App 토큰으로 리포를 열기 전에** 이 사람이 그 설치를 볼 수 있는지 묻는다.
 * 이것이 없으면 로그인한 누구나 우리 App이 설치된 남의 리포를 우리 토큰으로 읽을 수 있다.
 *
 * 판정은 `planRepoConnect`가 한다 — `connectRepository`와 같은 함수이고, 그래서 §5.7의 공격
 * 시나리오 둘이 두 경로에서 같은 답을 낸다.
 */
export async function checkRepoAccess(
  prisma: PrismaClient,
  userId: string,
  owner: string,
  repo: string,
  /** `planRepoConnect`의 넷째 조건(리포 쓰기 권한). 기본값이 없다 — `false`는 재적재뿐이다. */
  requirePush: boolean,
): Promise<
  | { status: "ok"; connect: RepoConnect; repositoryId: string; installationId: string; repoOwner: string; repoName: string; defaultBranch: string }
  | { status: "rejected"; error: OnboardFailure }
> {
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status !== "ok") return { status: "rejected", error: token.status };

  /**
   * ⚠️ **인가가 App 자격증명보다 앞이다** (2026-09-09, sec-audit 발견 5). 전에는 `probeRepo`가 먼저
   * 돌았고, `RepoInput`은 `z.string().min(1)` 둘뿐이다 — 로그인은 검증 이메일만 요구하므로(ARCHITECTURE §6.00,
   * 의도된 성질) **낯선 사람이 임의 private 리포에 대해 "말모이 App이 설치돼 있는가"를 물을 수
   * 있었다.** 반환 갈래가 `repo-not-installed`(없다)와 `installation-forbidden`(있는데 못 본다)로
   * 갈려 그대로 화면 문구가 됐다 — **존재 오라클**이다. 부수로 App quota를 상한 없이 태운다.
   *
   * 지금은 **사용자 토큰으로만** 그 리포가 내 설치에 있는지 먼저 보고, 없으면 한 갈래로 거부한다.
   * ⚠️ **`planRepoConnect`의 3중 검증은 그대로다** — 순서만 바뀐다.
   */
  let userInstallationIds: readonly string[];
  let userRepos: readonly UserRepo[] = [];
  try {
    userInstallationIds = await listUserInstallations(token.accessToken);
    const wanted = `${owner}/${repo}`.toLowerCase();
    /**
     * ⚠️ **한 설치의 실패가 나머지를 막지 않는다** (`listConnectableRepos`와 같은 판단). 일시중지된
     * 설치는 403을 주고 그건 영구 상태다 — 통째로 접으면 정상 설치의 리포도 연결하지 못한다.
     */
    const settled = await Promise.all(
      userInstallationIds.map((id) =>
        listInstallationRepos(token.accessToken, id).then(
          (repos): { repos: readonly InstallationRepo[]; error?: unknown } => ({ repos }),
          (error: unknown): { repos: readonly InstallationRepo[]; error?: unknown } => ({ repos: [], error }),
        ),
      ),
    );
    // 대소문자만 다른 이름을 거짓 거부하지 않는다 (`planRepoConnect`와 같은 규칙).
    const holder = settled.find((r) => r.repos.some((row) => row.fullName.toLowerCase() === wanted));
    if (holder === undefined) {
      /**
       * ⚠️ **하나도 못 읽었는데 실패가 있었다면 "설치 안 됨"이 아니다** — 장애를 거부로 위장하면
       * 화면이 "App이 설치돼 있지 않다"고 단언하고, 사용자는 **이미 설치한 것을 다시 설치하러 간다.**
       * 형제 `listConnectableRepos`가 같은 선을 긋는다 (POSTMORTEM 2026-09-06 "401이 not-installed로
       * 접혀 있었다").
       *
       * ⚠️ **부분 실패는 그대로 진행한다** — 일시중지된 설치의 403은 영구 상태이고, 통째로 접으면
       * 정상 설치의 리포도 연결하지 못한다. 단, 요청 리포를 못 찾았고 401이 있으면 재인가가 먼저다.
       */
      const failures = settled.flatMap((r) => ("error" in r ? [r.error] : []));
      // 원인은 어느 갈래든 로그에만 남는다 — 화면에 실으면 존재 오라클이 된다.
      for (const error of failures) logFailure("onboard-access", error);
      if (failures.some(error => httpStatus(error) === 401)) {
        return { status: "rejected", error: "reauthorize" };
      }
      if (failures.length > 0 && failures.length === settled.length) {
        return { status: "rejected", error: "unavailable" };
      }
      // ⚠️ **여기서 갈래를 나누지 않는다** — "우리 App이 없다"와 "네가 못 본다"를 구별해 주는 것이
      // 곧 오라클이다. 화면 문구도 하나로 간다 (`lib/onboarding/message.ts`).
      return { status: "rejected", error: "repo-not-installed" };
    }
    userRepos = holder.repos;
  } catch (error) {
    if (httpStatus(error) === 401) return { status: "rejected", error: "reauthorize" };
    logFailure("onboard-access", error);
    return { status: "rejected", error: "unavailable" };
  }

  // ⚠️ **try 밖이다.** `probeRepo`는 GitHub 실패를 값으로 주고, 던지는 것은 환경변수 누락(설정
  // 오류)뿐이다 — 그것을 아래 catch가 `unavailable`로 접으면 "잠시 뒤 다시"가 영원히 뜬다.
  const probe = await probeRepo(owner, repo);

  const connect = planRepoConnect({ probe, userInstallationIds, userRepos, requirePush });
  // ⚠️ **`unavailable`을 거부로 접지 않는다** — `planProjectCreate`가 그것을 그대로 흘리도록
  // 설계됐고, 여기서 접으면 사용자가 있는 권한을 없다고 믿는다 (POSTMORTEM 2026-09-03).
  if (connect.status !== "ok" || probe.status !== "ok") {
    return connect.status === "ok"
      ? { status: "rejected", error: "unavailable" }
      : { status: "rejected", error: connect.status };
  }

  return {
    status: "ok",
    connect,
    // ⚠️ **null 폴백을 두지 않는다** — 위에서 `probe.status`를 좁혔으므로 여기서 부재를 표현하면
    // 고정되지 않은 프로젝트를 **새로 만드는** 경로가 생긴다 (sec-audit-2 발견 34).
    repositoryId: probe.repositoryId,
    installationId: connect.installationId,
    repoOwner: connect.repoOwner,
    repoName: connect.repoName,
    // `GET /repos` 응답에 이미 있다 — pull이 이 값을 읽는다 (ARCHITECTURE §3.1).
    defaultBranch: probe.defaultBranch,
  };
}
