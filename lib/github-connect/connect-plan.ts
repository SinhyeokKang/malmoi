import type { ProbeResult } from "./health";

/**
 * ARCHITECTURE §6의 **3중 검증이 값으로 판정되는 자리**. 5단계 프로젝트 생성 경로가 이 함수를
 * 그대로 재사용하므로, 여기가 닫히면 §5.7의 공격 시나리오 둘("설치되지 않은 리포를 등록"·"접근할 수
 * 없는 설치로 생성")이 그 단계에서 함께 닫힌다.
 *
 * ```
 * User에 GitHub Account가 연결됨                     ← 껍데기가 먼저 본다 (not-connected)
 *   AND 로그인 사용자가 그 installation에 접근 가능    ← installation-forbidden
 *   AND installation이 선택한 repository에 접근 가능   ← repo-forbidden
 *   AND 그 사람이 그 repository에 쓸 수 있음           ← repo-read-only
 * ```
 *
 * **넷째 조건은 sec-audit-3 발견 1a다.** 생성자는 push 토큰을 받고, 그 토큰의 페이로드가 정한 로케일·경로가
 * **설치 토큰의 커밋**이 된다 — 읽기 전용 협력자가 만들면 가진 적 없는 쓰기 권한을 빌린다. 이미 쓸 수 있는
 * 사람이면 sync 브랜치에 무엇이 커밋되든 상승이 아니다. 기존 프로젝트에는 소급하지 않는다(생성 당시 권한을
 * 알 수 없다) — 다음 Reconnect부터 걸린다.
 *
 * ⚠️ **`installationId`는 클라이언트에서 오지 않는다.** `probe`가 App JWT 조회 결과이고, 사용자 쪽 두
 * 목록은 **제출 시점에 다시 부른 것**이다 — 렌더 때 본 목록을 폼에 실어 믿으면 클라이언트가 보낸 값을
 * 인가 근거로 쓰는 것이 된다 (ARCHITECTURE §6.00 ③).
 *
 * ⚠️ **조회 실패를 거부로 접지 않는다.** 장애를 "권한 없음"으로 말하면 사용자가 있는 권한을 없다고
 * 믿는다 (POSTMORTEM 2026-09-03).
 */

export type RepoConnect =
  | { status: "ok"; installationId: string; repoOwner: string; repoName: string }
  | { status: "repo-not-installed" }
  | { status: "installation-forbidden" }
  | { status: "repo-forbidden" }
  | { status: "repo-read-only" }
  | { status: "unavailable" };

/** 사용자 토큰으로 본 리포 한 행. `push`는 **로그인 사용자 기준** 권한이고, 응답에 없으면 `null`이다. */
export type UserRepo = { fullName: string; push: boolean | null };

/**
 * @param userInstallationIds `GET /user/installations`의 전 페이지. **잘라서 넘기면 안 된다** —
 *   표시용이 아니라 인가 판정용이라 31번째가 빠지면 정당한 재연결이 거짓 거부된다.
 * @param userRepos `GET /user/installations/{id}/repositories`의 전 페이지.
 * @param requirePush 넷째 조건을 걸지. **기본값이 없다** — 호출처가 그 경로가 리포 쓰기를 빌리는지 스스로
 *   말하게 한다. `false`는 재적재(Sync)뿐이다: 리포를 읽어 DB에 넣을 뿐이라 쓰기 권한의 상승이 아니고,
 *   쓰기 권한 없이 초대된 OWNER(설계가 받아들인 잔여)가 거기서 막히면 회귀다.
 */
export function planRepoConnect(input: {
  probe: ProbeResult;
  userInstallationIds: readonly string[];
  userRepos: readonly UserRepo[];
  requirePush: boolean;
}): RepoConnect {
  const { probe, userInstallationIds, userRepos, requirePush } = input;

  if (probe.status === "error") return { status: "unavailable" };
  if (probe.status === "not-installed") return { status: "repo-not-installed" };

  // 빈 목록은 통과가 아니다 — fail-closed.
  if (!userInstallationIds.includes(probe.installationId)) {
    return { status: "installation-forbidden" };
  }

  // 대소문자만 다른 이름을 거짓 거부하지 않는다 (health.ts의 이동 판정과 같은 이유).
  const wanted = probe.fullName.toLowerCase();
  const repo = userRepos.find((row) => row.fullName.toLowerCase() === wanted);
  if (repo === undefined) return { status: "repo-forbidden" };
  // ⚠️ `null`(응답에 `permissions` 없음)은 거부가 아니다 — 모르는 것을 "권한 없음"으로 말하지 않는다.
  if (requirePush && repo.push === null) return { status: "unavailable" };
  if (requirePush && !repo.push) return { status: "repo-read-only" };

  const ref = splitFullName(probe.fullName);
  // GitHub이 준 이름이 `owner/name`이 아니면 응답을 이해하지 못한 것이다 — 모르는 것을 "권한 없음"으로
  // 말하지 않는다.
  if (ref === null) return { status: "unavailable" };

  // ⚠️ 이름은 **probe가 준 현재 값**이다. 리네임된 리포를 재연결하면 여기서 새 이름이 나가고,
  // 그것이 `repoOwner`·`repoName`이 갱신되는 유일한 경로다.
  return { status: "ok", installationId: probe.installationId, ...ref };
}

function splitFullName(fullName: string): { repoOwner: string; repoName: string } | null {
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const [repoOwner, repoName] = parts;
  if (!repoOwner || !repoName) return null;
  return { repoOwner, repoName };
}
