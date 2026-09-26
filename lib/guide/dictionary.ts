import { isValidElement } from "react";

/**
 * 사전 → 문자열 잎 집합. 굵게 쓴 라벨이 여기 **정확히** 있어야 한다(AUTHORING 규약).
 *
 * - **`publicDocs.docs.sections`만 뺀다** — 옛 문서 본문이 거기 살아서, 넣으면 문서가 자기 자신을 근거로
 *   늘 green이 된다. `publicDocs`의 나머지(복귀 링크·`/privacy`·셸 라벨 `docs.title`)는 실제 화면 라벨이라 남긴다
 *   (2026-09-26 사용자 결정).
 * - **함수 값·JSX 값을 뺀다** — 보간·조각 라벨(`Publish 3 changes`)은 굵게 쓰지 않기로 했다.
 */
const EXCLUDED = "publicDocs.docs.sections";

export function dictionaryStrings(dict: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown, path: string): void => {
    if (path === EXCLUDED) return;
    if (typeof value === "string") out.add(value);
    else if (typeof value === "function" || isValidElement(value)) return;
    else if (Array.isArray(value)) value.forEach((item) => walk(item, `${path}[]`));
    else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(dict, "");
  return out;
}
