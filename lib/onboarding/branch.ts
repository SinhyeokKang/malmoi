/**
 * ①의 브랜치 칸이 무엇으로 서는지 (feature design §3.2·§4). I/O가 없다 — `listRepoBranches`가 값을 준다.
 *
 * ⚠️ **실패한 조회를 "브랜치가 없다"로 읽지 않는다** (POSTMORTEM 2026-09-03). 조회가 실패하면 빈
 * `Select`가 아니라 **읽기 전용 default branch**이고, 화면이 그 사실을 캡션으로 말한다 — 빈 목록을
 * 보이면 사용자는 리포에 브랜치가 하나뿐이라고 읽는다.
 */
export type BranchChoice =
  /** 목록을 받았다 — 고를 수 있다. */
  | { mode: "select"; names: string[]; selected: string }
  /** 300개에서 끊겼다 — 목록이 답이 아니므로 자유 입력(`isValidBranchName`)이다. */
  | { mode: "input"; selected: string }
  /** 조회가 실패했다 — default branch 하나로 읽기 전용. ①을 막지는 않는다 (예외 D). */
  | { mode: "fixed"; selected: string };

export function planBranchChoice(input: {
  /** `undefined`가 **조회 실패**다 — 빈 배열(브랜치가 0개)과 다른 뜻이다. */
  names: readonly string[] | undefined;
  defaultBranch: string;
  truncated?: boolean;
}): BranchChoice {
  const { names, defaultBranch, truncated = false } = input;
  if (names === undefined) return { mode: "fixed", selected: defaultBranch };
  if (truncated) return { mode: "input", selected: defaultBranch };
  // default branch가 앞이다 — 300개 중에서 기본값을 찾아 스크롤하게 두지 않는다. 나머지는 GitHub이 준
  // 순서 그대로다(이미 이름순이고, 우리가 다시 정렬하면 그쪽이 바뀔 때 조용히 갈린다).
  return { mode: "select", names: [...new Set([defaultBranch, ...names])], selected: defaultBranch };
}
