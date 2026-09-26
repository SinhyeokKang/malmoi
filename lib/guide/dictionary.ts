import { isValidElement } from "react";

/**
 * 사전 → 문자열 잎 집합. 굵게 쓴 라벨이 여기 **정확히** 있어야 한다(AUTHORING 규약).
 *
 * - **최상위 `publicDocs` 서브트리를 뺀다** — 옛 문서 본문이 거기 살아서, 넣으면 문서가 자기 자신을 근거로
 *   늘 green이 된다.
 * - **함수 값·JSX 값을 뺀다** — 보간·조각 라벨(`Publish 3 changes`)은 굵게 쓰지 않기로 했다.
 */
export function dictionaryStrings(dict: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown, top: boolean): void => {
    if (typeof value === "string") out.add(value);
    else if (typeof value === "function" || isValidElement(value)) return;
    else if (Array.isArray(value)) value.forEach((item) => walk(item, false));
    else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) if (!(top && key === "publicDocs")) walk(child, false);
    }
  };
  walk(dict, true);
  return out;
}
