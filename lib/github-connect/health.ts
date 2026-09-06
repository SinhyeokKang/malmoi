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
  | { status: "ok"; installationId: string; fullName: string }
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
 * HTTP 상태 → probe 분류. `probeRepo`가 부른다.
 *
 * ⚠️ **403이 `error`가 아니라 `not-installed`다.** 설치 일시중지(suspended)는 **영구 상태**라
 * `unknown`("잠시 뒤 다시")으로 두면 그 안내가 영원히 뜬다. 401·404는 설치 부재이고, 설치가 삭제되면
 * `GET /repos`가 아니라 **토큰 발급**이 그 상태로 죽으므로 껍데기의 try가 클라이언트 생성까지 감싼다.
 *
 * @param status 예외에 상태가 없으면(네트워크 오류) `undefined`가 온다 — 부재를 `not-installed`로
 *   읽지 않는다.
 */
export function probeFromError(status: number | undefined): "not-installed" | "error" {
  return status === 401 || status === 403 || status === 404 ? "not-installed" : "error";
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
