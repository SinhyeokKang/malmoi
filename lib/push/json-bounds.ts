/**
 * **`placeholders`의 자원 상한** (sec-audit-3 발견 18).
 *
 * ⚠️ **모양 검사가 아니다.** `placeholders`는 해석하지 않고 나르는 계약이고(`LocaleEntry.placeholders`),
 * 크롬 스펙을 따라다니지 않는다. 여기서 거는 것은 저장·렌더·직렬화 재귀가 넘치지 않게 하는 **깊이와
 * 크기**뿐이다 — 크롬 블록(`{name:{content,example}}`)은 깊이 2라 상한과 멀다.
 *
 * ⚠️ **깊이는 반복으로 잰다.** 재귀로 재면 재려는 값이 곧 스택을 넘기는 입력이다. 깊이를 먼저 통과한
 * 값만 `JSON.stringify`에 넘기므로 그 재귀도 상한 안에서 돈다.
 */
export function jsonWithinBounds(value: unknown, bounds: { maxDepth: number; maxBytes: number }): boolean {
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, depth } = item;
    if (node === null || typeof node !== "object") continue;
    // 컨테이너 하나가 깊이 하나다 — 스칼라는 세지 않는다.
    if (depth + 1 > bounds.maxDepth) return false;
    const children: unknown[] = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) stack.push({ node: child, depth: depth + 1 });
  }
  if (value === undefined) return true;
  return new TextEncoder().encode(JSON.stringify(value)).length <= bounds.maxBytes;
}
