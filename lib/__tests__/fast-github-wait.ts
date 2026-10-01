/**
 * **`@/lib/github-wait`의 짧은 마감 사본** — 라우트 테스트가 `vi.mock("@/lib/github-wait", () => import("@/lib/__tests__/fast-github-wait"))`로
 * 갈아 끼운다. 모양(늦으면 `late()`, 거부는 그대로)과 **타이머를 끄는 것**까지 실물과 같고 마감만 짧다.
 *
 * ⚠️ 손 사본을 두 파일에 두면 실물과 갈린다 — 타이머를 안 끈 사본이 작업이 이긴 뒤에도 `late()`를 불러, 그 로그가 파일이 끝난 뒤 나가
 * vitest가 `EnvironmentTeardownError`로 CI를 red로 만들었다(PR #171).
 */
export const FAST_GITHUB_WAIT_MS = 20;
export const GITHUB_WAIT_MS = FAST_GITHUB_WAIT_MS;

export async function withinGithubWait<T>(work: Promise<T>, late: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(late()), FAST_GITHUB_WAIT_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
