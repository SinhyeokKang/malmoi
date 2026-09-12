/**
 * 원본과 write 출력의 **변경 줄 비율** — 첫 pull PR diff 크기의 대리 지표다.
 *
 * 실제 `git diff`를 부르지 않는다. 리포 100개 × 파일 수천 개를 재는데 프로세스를 띄우면
 * 측정이 I/O에 잡아먹히고, 무엇보다 **순수 함수라야 픽스처로 검증된다**.
 */

/**
 * 매칭 쌍(r) 상한. 넘으면 근사로 떨어진다.
 *
 * 로케일 파일은 줄이 대체로 유일해서(키마다 한 줄) r ≈ 줄 수다. r이 폭발하려면 같은 줄이 수천 번
 * 반복돼야 하는데 그런 파일은 카탈로그가 아니다.
 */
const MATCH_BUDGET = 5_000_000;

/**
 * `1 - 2·LCS / (원본 줄 수 + 출력 줄 수)`.
 *
 * 이 식이라야 세 기준이 정확히 떨어진다: 동일 → `0`, 한 줄 변경 → `1/n`, 전면 재정렬 → `1 - 1/n`.
 * "바뀐 줄 / 전체 줄"을 그냥 세면 삽입과 삭제가 비대칭이라 파일이 길어질 때 값이 흔들린다.
 */
export function roundtripDiffRatio(original: string, written: string): number {
  const a = original.split("\n");
  const b = written.split("\n");
  const total = a.length + b.length;
  if (total === 0) return 0;

  const { head, tail, ma, mb } = trimCommon(a, b);
  if (ma.length === 0 && mb.length === 0) return 0;

  const lcs = head + tail + lcsLength(ma, mb);
  const ratio = 1 - (2 * lcs) / total;
  // 부동소수 오차로 -0이나 1을 아주 살짝 넘는 값이 나오지 않게 한다.
  return ratio <= 0 ? 0 : ratio >= 1 ? 1 : ratio;
}

/**
 * 변경이 **몇 군데로 흩어졌나** — `git diff`의 hunk 수와 같은 뜻이다.
 *
 * ⚠️ **비율이 못 보는 것을 본다.** 중첩 JSON에서 하위 층만 재정렬되고 값 편집이 3건이면
 * `roundtripDiffRatio`는 0.083(목표 통과)인데 hunk가 41개다 — 리뷰어는 3건을 찾으려고 41번
 * 스크롤한다. 구조 줄(`},` · `"name": {`)이 파일 전체에 반복돼 LCS가 그걸 서로 매칭하므로
 * **비율은 중첩 JSON의 리뷰 고통을 체계적으로 과소평가한다**
 *.
 *
 * 매칭 쌍이 예산을 넘으면 `undefined`다 — 근사로 세면 hunk를 **과소평가**하게 되고, 이 지표는
 * 작을수록 좋다고 읽히므로 과소평가가 곧 거짓 안심이다. `roundtripDiffRatio`가 그 경우를
 * `usedApproximation`으로 따로 보고한다.
 */
export function changedHunks(original: string, written: string): number | undefined {
  const { ma, mb } = trimCommon(original.split("\n"), written.split("\n"));
  if (ma.length === 0 && mb.length === 0) return 0;
  if (ma.length === 0 || mb.length === 0) return 1;

  const pairs = lcsPairs(ma, mb);
  if (pairs === undefined) return undefined;

  let hunks = 0;
  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of pairs) {
    // 매칭 사이에 소비되지 않은 줄이 있으면 그 구간이 하나의 덩어리다.
    if (pa > ai || pb > bi) hunks += 1;
    ai = pa + 1;
    bi = pb + 1;
  }
  if (ai < ma.length || bi < mb.length) hunks += 1;
  return hunks;
}

/**
 * LCS를 이루는 `(a 위치, b 위치)` 쌍 — `lcsLength`와 같은 알고리즘에 **역추적을 얹은 것**이다.
 *
 * 길이만으로는 hunk를 셀 수 없다: 어디가 매칭됐는지 알아야 "사이가 비었나"를 판정한다.
 */
function lcsPairs(a: readonly string[], b: readonly string[]): Array<[number, number]> | undefined {
  const positions = new Map<string, number[]>();
  for (let i = 0; i < b.length; i += 1) {
    const line = b[i]!;
    const list = positions.get(line);
    if (list) list.push(i);
    else positions.set(line, [i]);
  }
  let matches = 0;
  for (const line of a) matches += positions.get(line)?.length ?? 0;
  if (matches > MATCH_BUDGET) return undefined;

  /** 노드를 병렬 배열로 둔다 — 매칭 수만큼 객체를 만들면 큰 파일에서 메모리가 튄다. */
  const nodeB: number[] = [];
  const nodeA: number[] = [];
  const nodePrev: number[] = [];
  const tailsValue: number[] = [];
  const tailsNode: number[] = [];

  for (let ai = 0; ai < a.length; ai += 1) {
    const list = positions.get(a[ai]!);
    if (!list) continue;
    // **내림차순으로 넣어야** 같은 줄의 여러 위치가 한 번의 매칭으로 겹쳐 세어지지 않는다.
    for (let k = list.length - 1; k >= 0; k -= 1) {
      const value = list[k]!;
      const at = lowerBound(tailsValue, value);
      nodeA.push(ai);
      nodeB.push(value);
      nodePrev.push(at > 0 ? tailsNode[at - 1]! : -1);
      const idx = nodeA.length - 1;
      if (at === tailsValue.length) {
        tailsValue.push(value);
        tailsNode.push(idx);
      } else {
        tailsValue[at] = value;
        tailsNode[at] = idx;
      }
    }
  }

  const out: Array<[number, number]> = [];
  let cur = tailsNode.length === 0 ? -1 : tailsNode[tailsNode.length - 1]!;
  while (cur !== -1) {
    out.push([nodeA[cur]!, nodeB[cur]!]);
    cur = nodePrev[cur]!;
  }
  return out.reverse();
}

/** 공통 접두·접미를 떼면 "한 줄만 바뀐 파일"이 몇 줄짜리 문제로 줄어든다. */
function trimCommon(a: readonly string[], b: readonly string[]) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail += 1;
  }
  return { head, tail, ma: a.slice(head, a.length - tail), mb: b.slice(head, b.length - tail) };
}

/**
 * LCS 길이 — Hunt–Szymanski (매칭 위치에 대한 patience LIS). `O(r log n)`.
 *
 * ⚠️ **DP(`O(n·m)`)를 쓰지 않는 이유는 속도가 아니라 폴백의 오답이다.** 처음엔 큰 입력에서
 * "줄 다중집합 교집합"으로 근사했는데, 그 근사는 순서를 무시하므로 **전면 재정렬된 파일을
 * '동일'로 본다** — 12000줄 순열에 0을 냈다. 하필 그게 이 지표가 재려는 바로 그 현상이라
 * (ARCHITECTURE §1.1 키 정렬 개정 여부), 근사가 "개정 불필요"라는 정반대 결론을 낼 수 있었다.
 * Hunt–Szymanski는 크기와 무관하게 정확하므로 그 함정이 사라진다.
 */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  /** b의 각 줄 → 등장 위치(오름차순) */
  const positions = new Map<string, number[]>();
  for (let i = 0; i < b.length; i += 1) {
    const line = b[i]!;
    const list = positions.get(line);
    if (list) list.push(i);
    else positions.set(line, [i]);
  }

  let matches = 0;
  for (const line of a) matches += positions.get(line)?.length ?? 0;
  if (matches > MATCH_BUDGET) return approximateLcs(a, b);

  /** patience LIS — tails[k] = 길이 k+1인 증가 부분열의 최소 끝값 */
  const tails: number[] = [];
  for (const line of a) {
    const list = positions.get(line);
    if (!list) continue;
    // **내림차순으로 넣어야** 같은 줄의 여러 위치가 한 번의 매칭으로 겹쳐 세어지지 않는다.
    for (let k = list.length - 1; k >= 0; k -= 1) {
      const value = list[k]!;
      const at = lowerBound(tails, value);
      if (at === tails.length) tails.push(value);
      else tails[at] = value;
    }
  }
  return tails.length;
}

/** `tails`에서 `value` 이상인 첫 위치. */
function lowerBound(tails: readonly number[], value: number): number {
  let lo = 0;
  let hi = tails.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tails[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * LCS의 **상한** 근사 — 줄 다중집합의 교집합 크기. 매칭 쌍이 상한을 넘을 때만 쓴다.
 *
 * 순서를 무시하므로 비율을 과소평가한다. 같은 줄이 수백만 쌍으로 겹치는 파일에서만 걸리고,
 * 그런 파일은 애초에 카탈로그가 아니다. 걸렸는지는 `usedApproximation`으로 따로 보고한다.
 */
function approximateLcs(a: readonly string[], b: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  let shared = 0;
  for (const line of b) {
    const left = counts.get(line) ?? 0;
    if (left > 0) {
      counts.set(line, left - 1);
      shared += 1;
    }
  }
  return shared;
}

/** 이 입력 쌍이 근사 경로로 갔는지 — 표에 표시해야 숫자를 읽는 사람이 속지 않는다. */
export function usedApproximation(original: string, written: string): boolean {
  const { ma, mb } = trimCommon(original.split("\n"), written.split("\n"));
  if (ma.length === 0 || mb.length === 0) return false;
  const counts = new Map<string, number>();
  for (const line of mb) counts.set(line, (counts.get(line) ?? 0) + 1);
  let matches = 0;
  for (const line of ma) matches += counts.get(line) ?? 0;
  return matches > MATCH_BUDGET;
}
