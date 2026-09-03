import type { PullChange } from "./plan";

/**
 * Git Data API 요청 본문 조립. **반환 타입을 명시하는 것이 이 파일의 요지다.**
 *
 * POSTMORTEM 2026-08-31: `/api/push` 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가
 * 침묵했다. 여기는 **외부 계약**(GitHub REST)이라 같은 함정이 그대로 열려 있고, 그중 `base_tree`
 * 누락은 리포의 나머지 파일이 전부 삭제된 커밋을 만든다 — 되돌릴 수 있지만 사람이 먼저 놀란다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이다.
 */

/**
 * 이 마커가 없으면 pull이 만든 커밋이 base에 머지될 때 push가 다시 돌아 무한 루프가 된다
 * (ARCHITECTURE §3). ⚠️ **push 측 스킵 판정은 이 상수를 import하지 못한다** — 대상 리포 워크플로의
 * YAML `if:`(`docs/ACTIONS.md`)에 리터럴로 박혀 있다. 이 값을 바꾸면 그쪽도 함께 바꾼다.
 */
export const SKIP_MARKER = "[skip-l10n]";

export type TreeEntry = {
  path: string;
  /** 일반 파일. 실행 권한·심링크를 낼 일이 없다. */
  mode: "100644";
  type: "blob";
  content: string;
};

export type TreePayload = {
  /**
   * **빼면 트리가 새로 만들어져 리포의 나머지 파일이 전부 삭제된 커밋이 된다.**
   * snake_case인 것은 GitHub REST의 필드명이라서다.
   */
  base_tree: string;
  tree: TreeEntry[];
};

export function buildTreePayload(
  changes: readonly PullChange[],
  baseTreeSha: string,
): TreePayload {
  // 낼 것이 없는데 트리를 만들면 base와 내용이 같은 빈 커밋이 나간다.
  if (changes.length === 0) throw new Error("변경분이 0개다 (트리를 만들 이유가 없다)");
  // 빈 문자열은 필드 누락과 구별되지 않는다 — GitHub이 조용히 base 없는 트리로 처리한다.
  if (baseTreeSha === "") throw new Error("base_tree가 비어 있다");

  return {
    base_tree: baseTreeSha,
    tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content })),
  };
}

export type CommitPayload = {
  message: string;
  tree: string;
  /**
   * **항상 base head 하나다.** `l10n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고,
   * base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반이다 (MVP §2).
   * 튜플로 둬서 둘째 parent가 들어올 여지를 타입으로 막는다.
   */
  parents: [string];
};

export function buildCommitPayload(
  treeSha: string,
  parentSha: string,
  summary: string,
): CommitPayload {
  if (treeSha === "") throw new Error("tree SHA가 비어 있다");
  // parents가 비면 리포의 루트 커밋이 되어 base의 히스토리 전체가 떨어져 나간다.
  if (parentSha === "") throw new Error("parent SHA가 비어 있다 (base head여야 한다)");

  const body = summary === "" ? "sync translations" : `sync translations (${summary})`;
  return {
    message: `l10n: ${body} ${SKIP_MARKER}`,
    tree: treeSha,
    parents: [parentSha],
  };
}
