import type { GitTreeBlob } from "@/lib/pull/client";

/**
 * 리포를 여러 번 읽는 동안 **자격증명을 한 번만 받는** 리더. 온보딩의 탐지·첫 적재·재적재가 이것을 쓴다 — 구현은 호스트별이다
 * (`./index`의 `openRepoReader`).
 *
 * `blob`은 못 읽으면 `undefined`다. 후보를 떨어뜨리는 대신 "키 수 확인 실패"로 표시하는 것이 호출부의
 * 규칙이라(ARCHITECTURE §4의 연장) 여기서 던지지 않는다 — 대신 실패는 **로그에 남는다**.
 */
export type RepoReader = {
  snapshot(baseBranch: string): Promise<RepoSnapshot>;
  /** 트리 항목의 `sha`로 읽는다 — contents API의 1MB 상한이 없다. */
  blob(sha: string): Promise<string | undefined>;
  /**
   * 다운로드 예산(`checkDownloadBudget`) 대상 경로의 크기. 트리 응답에 크기가 실리는 호스트는 인자 스냅샷에서 읽는다(호출 0 —
   * `sizesFromSnapshot`). 리더는 상태를 들지 않는다 — 스냅샷을 인자로 받는 이유다.
   * `lfs`는 그 경로가 LFS 포인터라는 뜻이다 — 포인터를 파싱하거나 Publish가 덮어쓰면 안 된다.
   */
  sizes(snapshot: Extract<RepoSnapshot, { status: "ok" }>, paths: readonly string[]): Promise<RepoSizes>;
};

export type RepoSizes = { status: "ok"; sizes: Map<string, number> } | { status: "lfs"; path: string } | { status: "unavailable" };

/**
 * 온보딩이 보는 리포 스냅샷 (ARCHITECTURE §3.1). **잘림·브랜치 부재·장애를 값으로 준다** — 온보딩은 그것을
 * "파일이 너무 많아 자동 탐지를 할 수 없어요"처럼 **말해야** 하고, pull은 같은 상황에서 **던져야** 한다
 * (부분 트리로 blob SHA를 비교하면 전부 틀어진다). 그래서 판정이 아니라 값이고, `GitClient.getTree`가
 * 이 위에서 던진다 — `lib/pull/client.ts`의 계약은 그대로다.
 */
export type RepoSnapshot =
  | { status: "ok"; headSha: string; headCommittedAt: string; files: GitTreeBlob[] }
  | { status: "truncated" }
  | { status: "base-branch-missing" }
  | { status: "unavailable" };

/**
 * ①의 브랜치 목록 (DESIGN §6.7). 실패가 값인 이유는 **①을 막지 않기 위해서**다 — 404도 마찬가지다. 호스트는 권한 없는 리소스에도
 * 404를 주므로 "브랜치가 없다"로 단정할 수 없다 (POSTMORTEM 2026-09-03).
 */
export type BranchList = { status: "ok"; names: string[]; truncated: boolean } | { status: "unavailable" };

/**
 * 트리 응답에 크기가 실리는 호스트(GitHub)의 `sizes`. **크기가 없는 경로는 지도에서 빠진다** — 0으로 세면 예산이 통째로 무의미해지고,
 * 빠진 경로는 `checkDownloadBudget`이 "크기를 모른다"로 거부한다(지금 동작 그대로).
 */
export function sizesFromSnapshot(snapshot: Extract<RepoSnapshot, { status: "ok" }>, paths: readonly string[]): RepoSizes {
  const wanted = new Set(paths);
  const sizes = new Map<string, number>();
  for (const file of snapshot.files) if (wanted.has(file.path) && file.size !== undefined) sizes.set(file.path, file.size);
  return { status: "ok", sizes };
}
