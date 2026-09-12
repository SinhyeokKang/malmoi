import type { ProbeResult } from "./health";

/**
 * ARCHITECTURE §6의 **3중 검증이 값으로 판정되는 자리** (design §3.2). 5단계 프로젝트 생성 경로가 이 함수를
 * 그대로 재사용하므로, 여기가 닫히면 §5.7의 공격 시나리오 둘("설치되지 않은 리포를 등록"·"접근할 수
 * 없는 설치로 생성")이 그 단계에서 함께 닫힌다.
 *
 * ```
 * User에 GitHub Account가 연결됨                     ← 껍데기가 먼저 본다 (not-connected)
 *   AND 로그인 사용자가 그 installation에 접근 가능    ← installation-forbidden
 *   AND installation이 선택한 repository에 접근 가능   ← repo-forbidden
 * ```
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
  | { status: "unavailable" };

/**
 * @param userInstallationIds `GET /user/installations`의 전 페이지. **잘라서 넘기면 안 된다** —
 *   표시용이 아니라 인가 판정용이라 31번째가 빠지면 정당한 재연결이 거짓 거부된다.
 * @param userRepoFullNames `GET /user/installations/{id}/repositories`의 전 페이지.
 */
export function planRepoConnect(input: {
  probe: ProbeResult;
  userInstallationIds: readonly string[];
  userRepoFullNames: readonly string[];
}): RepoConnect {
  const { probe, userInstallationIds, userRepoFullNames } = input;

  if (probe.status === "error") return { status: "unavailable" };
  if (probe.status === "not-installed") return { status: "repo-not-installed" };

  // 빈 목록은 통과가 아니다 — fail-closed.
  if (!userInstallationIds.includes(probe.installationId)) {
    return { status: "installation-forbidden" };
  }

  // 대소문자만 다른 이름을 거짓 거부하지 않는다 (health.ts의 이동 판정과 같은 이유).
  const wanted = probe.fullName.toLowerCase();
  if (!userRepoFullNames.some((name) => name.toLowerCase() === wanted)) {
    return { status: "repo-forbidden" };
  }

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
