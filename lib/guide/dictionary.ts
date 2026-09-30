import { isValidElement } from "react";

/**
 * 사전 → 문자열 잎 집합. 굵게 쓴 라벨이 여기 **정확히** 있어야 한다(AUTHORING 규약).
 *
 * - **뺄 서브트리가 없다** — 2026-09-26까지 옛 문서 본문(사전의 `docs.sections`)을 뺐다. 넣으면 문서가 자기 자신을
 *   근거로 늘 green이 됐기 때문이다. 본문이 원고(md)로 옮겨 그 경로가 사라졌다. ⚠️ **문서 본문을 사전에 되돌리지 않는다** —
 *   되돌리면 이 게이트가 다시 자기 참조가 된다.
 * - **함수 값·JSX 값을 뺀다** — 보간·조각 라벨(`Publish 3 changes`)은 굵게 쓰지 않기로 했다.
 * - **`exclude`의 점 경로(과 그 아래)를 뺀다** — 화면에 안 보이는 값(`aria-label`에만 붙는 축 이름)을 호출자가 고른다.
 *   사전 키 이름에 가시성 관례가 없어서 이 함수가 추측하지 않는다.
 */
export function dictionaryStrings(dict: unknown, exclude: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown, path: string): void => {
    if (exclude.has(path)) return;
    if (typeof value === "string") out.add(value);
    else if (typeof value === "function" || isValidElement(value)) return;
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}.${i}`));
    else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) walk(child, path === "" ? key : `${path}.${key}`);
  };
  walk(dict, "");
  return out;
}
