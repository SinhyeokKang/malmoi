import { isValidElement } from "react";

/**
 * 사전 → 문자열 잎 집합. 굵게 쓴 라벨이 여기 **정확히** 있어야 한다(AUTHORING 규약).
 *
 * - **뺄 서브트리가 없다** — 2026-09-26까지 옛 문서 본문(사전의 `docs.sections`)을 뺐다. 넣으면 문서가 자기 자신을
 *   근거로 늘 green이 됐기 때문이다. 본문이 원고(md)로 옮겨 그 경로가 사라졌다. ⚠️ **문서 본문을 사전에 되돌리지 않는다** —
 *   되돌리면 이 게이트가 다시 자기 참조가 된다.
 * - **함수 값·JSX 값을 뺀다** — 보간·조각 라벨(`Publish 3 changes`)은 굵게 쓰지 않기로 했다.
 */
export function dictionaryStrings(dict: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string") out.add(value);
    else if (typeof value === "function" || isValidElement(value)) return;
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(dict);
  return out;
}
