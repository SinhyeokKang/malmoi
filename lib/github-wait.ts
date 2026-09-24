/**
 * **GitHub 대기 마감** (ARCHITECTURE §6.5.2 · audit-ux D5). 화면을 그리는 동안 GitHub을 기다리는 자리는 전부 이 값을 읽는다
 * — 목록의 원격 신호(`lib/projects/remote.ts`), 설정·Home의 연결 확인(`probeRepo`), 설정의 열린 PR(`loadOpenPrUrl`).
 *
 * ⚠️ **값이 하나여야 한다.** 같은 원격을 기다리는 두 화면이 마감이 다르면 한쪽은 "확인할 수 없음", 다른 쪽은 아직
 * 매달린 채로 갈린다 — 사본 둘을 두면 다시 갈린다.
 *
 * `octokit`을 물지 않는 잎 모듈이다 — `lib/github`를 mock하는 테스트(`open-pr.test.ts`)에서도 실물이 돈다.
 */
export const GITHUB_WAIT_MS = 8_000;

/**
 * 마감을 넘기면 `late()`의 값으로 접는다.
 *
 * ⚠️ **try/catch는 에러만 접고 지연은 못 접는다** — GitHub이 응답을 영영 안 주면 catch에 닿지 않고 페이지가
 * `maxDuration`까지 매달린다. ⚠️ **넘긴 요청을 취소하지는 않는다** — octokit에 그 손잡이가 없다. 남은 작업은 자기
 * 속도로 끝나고 결과는 버려진다. ⚠️ **거부는 그대로 던진다** — 분류(설정 오류는 던지고 GitHub 실패는 값)는 호출부의 몫이다.
 */
export async function withinGithubWait<T>(work: Promise<T>, late: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(late()), GITHUB_WAIT_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    // ⚠️ 타이머를 안 끄면 그 핸들이 이벤트 루프를 붙잡아 함수가 마감만큼 늦게 끝난다.
    clearTimeout(timer);
  }
}
