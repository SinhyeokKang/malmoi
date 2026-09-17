import { fail } from "@/lib/failure";
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
export const SKIP_MARKER = "[skip-malmoi-i18n]";

/**
 * 번역 PR의 제목. **마커가 제목에도 드는 이유**: 가드 셋은 `head_commit.message`의 부분 문자열만 보는데,
 * "Create a merge commit"으로 머지하면 그 메시지는 `Merge pull request #N from …\n\n<PR 제목>`이라
 * 커밋 메시지의 마커가 실리지 않는다 — 제목에 있어야 세 머지 방식 전부에서 잡힌다(`skip-marker.test.ts`).
 * 영문이다 — 대상 리포에 남는 문자열이고 CLAUDE.md가 PR title/body를 영문으로 못 박았다.
 */
export const PR_TITLE = `malmoi-i18n: sync translations ${SKIP_MARKER}`;

/** GitHub이 PR 제목에 허용하는 최대 길이. 넘기면 `PATCH /pulls`가 422다. */
const PR_TITLE_MAX = 256;

/**
 * 재사용하는 PR의 제목에 마커를 되돌린다. **원래 제목을 버리지 않는다** — 사람이 "Translations for 2.0"으로
 * 고친 제목을 기본 제목으로 덮으면 남의 편집을 조용히 지우는 것이다. 마커만 덧붙이고, 그래도 상한을
 * 넘는 경우에만 기본 제목으로 폴백한다(422로 pull 전체가 죽는 것보다 낫다). 마커가 이미 있으면 입력 그대로다 —
 * 호출부는 결과가 입력과 같으면 PATCH를 부르지 않는다.
 */
export function withSkipMarker(title: string): string {
  if (title.includes(SKIP_MARKER)) return title;
  const appended = `${title} ${SKIP_MARKER}`;
  return appended.length > PR_TITLE_MAX ? PR_TITLE : appended;
}

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
  /** base **커밋** SHA다 — GitHub이 `base_tree`에 커밋 SHA를 받으면 그 트리로 역참조한다. */
  baseSha: string,
): TreePayload {
  // 낼 것이 없는데 트리를 만들면 base와 내용이 같은 빈 커밋이 나간다.
  if (changes.length === 0) fail("no changes (nothing to build a tree from)");
  // 빈 문자열은 필드 누락과 구별되지 않는다 — GitHub이 조용히 base 없는 트리로 처리한다.
  if (baseSha === "") fail("base_tree is empty");

  return {
    base_tree: baseSha,
    tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content })),
  };
}

export type CommitPayload = {
  message: string;
  tree: string;
  /**
   * **항상 base head 하나다.** `malmoi-i18n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고,
   * base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반이다 (ARCHITECTURE §0).
   * 튜플로 둬서 둘째 parent가 들어올 여지를 타입으로 막는다.
   */
  parents: [string];
};

export function buildCommitPayload(
  treeSha: string,
  parentSha: string,
  summary: string,
): CommitPayload {
  if (treeSha === "") fail("tree SHA is empty");
  // parents가 비면 리포의 루트 커밋이 되어 base의 히스토리 전체가 떨어져 나간다.
  if (parentSha === "") fail("parent SHA is empty (must be the base head)");

  const body = summary === "" ? "sync translations" : `sync translations (${summary})`;
  return {
    message: `malmoi-i18n: ${body} ${SKIP_MARKER}`,
    tree: treeSha,
    parents: [parentSha],
  };
}
