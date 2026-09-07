/**
 * 연결 건강성 판정 (design §3.3). **상태 컬럼을 만들지 않고 App 쪽 조회로 계산한다** (SAAS §7.5) —
 * `SyncRun`(7단계)이 서기 전에 상태 컬럼을 만들면 그때 두 벌이 된다.
 *
 * ⚠️ **조회 실패(`error`)를 `app-uninstalled`로 접지 않는다.** 접으면 **장애가 "제거됨"으로 읽힌다** —
 * POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다")과
 * 2026-09-06("리다이렉트 횟수로 검증해서 전면 장애를 '정상'으로 읽었다")이 같은 부류이고,
 * `readSession`이 `none`과 `unavailable`을 가른 것과 정확히 같은 축이다.
 *
 * ⚠️ **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다.** 여기서는 새 값을 **보여줄
 * 뿐**이고 저장은 사람이 "다시 연결"을 눌러야 일어난다 (SAAS §7.9) — 소유자 이전까지 같은 코드로
 * 삼키지 않으려는 것이다.
 */

/** `probeRepo`(`lib/github.ts`, App 쪽 호출)의 결과. 이 판정층이 아는 유일한 외부 모양이다. */
export type ProbeResult =
  /**
   * @param defaultBranch `GET /repos` 응답에 이미 있다 — 호출을 늘리지 않는다. `Project.baseBranch`를
   *   이 값으로 채우지 않으면 default branch가 `develop`인 리포의 pull이 `main`을 찾는다 (design §4).
   *   `planConnectionHealth`는 이 필드를 보지 않는다 — 판정은 그대로다.
   */
  | { status: "ok"; installationId: string; fullName: string; defaultBranch: string }
  | { status: "not-installed" }
  | { status: "error" };

export type ConnectionHealth =
  | { status: "not-connected" }
  | { status: "app-uninstalled" }
  | { status: "installation-changed"; installationId: string }
  | { status: "repo-moved"; fullName: string }
  | { status: "ok" }
  | { status: "unknown" };

/**
 * octokit 에러에서 HTTP 상태를 꺼낸다. 없으면(네트워크 오류) `undefined` — **그것을 0이나 404로
 * 채우지 않는다.** 부재는 "모른다"이고 아래 분류가 그것을 `error`로 남긴다.
 */
export function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = (error as { status: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * HTTP 상태 → probe 분류. `probeRepo`가 부른다.
 *
 * ⚠️ **404가 설치 부재이고, 401은 아니다** (2026-09-06 실측으로 정정). App JWT가 유효한데 그 리포에
 * 설치가 없으면 GitHub은 **404**를 준다. **401은 JWT 자체가 무효**라는 뜻이다 — 개인키 손상·재발급·
 * appId 불일치. 그것을 `not-installed`로 접으면 화면이 "App이 제거됐어요 + 설치 링크"를 보이고,
 * 사용자는 GitHub에 가서 재설치한 뒤 **아무것도 고쳐지지 않은 것을 발견한다**(원인이 우리 서버의
 * 자격증명이므로). 개인키가 깨진 상태에서 실제로 그 응답을 봤다.
 *
 * ⚠️ **403은 `not-installed`다.** 설치 일시중지(suspended)는 **영구 상태**라 `unknown`("잠시 뒤 다시")로
 * 두면 그 안내가 영원히 뜬다.
 *
 * @param status 예외에 상태가 없으면(네트워크 오류) `undefined`가 온다 — 부재를 `not-installed`로
 *   읽지 않는다.
 */
export function probeFromError(status: number | undefined): "not-installed" | "error" {
  return status === 403 || status === 404 ? "not-installed" : "error";
}

export function planConnectionHealth(input: {
  project: { installationId: string | null; repoOwner: string; repoName: string };
  probe: ProbeResult;
}): ConnectionHealth {
  const { project, probe } = input;

  // 저장된 것이 없으면 probe 결과와 무관하게 아직 연결 전이다.
  if (project.installationId === null) return { status: "not-connected" };

  if (probe.status === "error") return { status: "unknown" };
  if (probe.status === "not-installed") return { status: "app-uninstalled" };

  // 설치 검사가 이름 검사보다 앞이다 — 재설치(새 id)를 "이동"으로 말하지 않는다.
  if (probe.installationId !== project.installationId) {
    return { status: "installation-changed", installationId: probe.installationId };
  }

  // 대소문자만 다른 것을 이동으로 읽지 않는다. GitHub이 정규화해 주지만, 거짓 경고가 사용자에게
  // "다시 연결"을 시키는 쪽이 비교를 접는 것보다 나쁘다.
  const stored = `${project.repoOwner}/${project.repoName}`;
  if (probe.fullName.toLowerCase() !== stored.toLowerCase()) {
    return { status: "repo-moved", fullName: probe.fullName };
  }

  return { status: "ok" };
}
