/**
 * 사전의 유일한 입구. **`m`이라는 짧은 이름을 쓰는 것이 요지다** — 화면 코드가 `m.translations.publish.nothing`처럼
 * 읽히고, `as const`라 그 접근 자체가 타입 검사다.
 *
 * ⚠️ **잎 모듈이다** — `@/lib/**`를 하나도 import하지 않는다. 클라이언트 컴포넌트가 이것을 읽으므로
 * 그래프가 곧 번들이다 (`components/__tests__/client-graph.test.ts`).
 *
 * **ko를 더할 때 바뀌는 곳은 이 파일 하나다** — `messages/ko.tsx`를 `satisfies Messages`로 만들고 `m`을
 * 상수에서 `getMessages(locale)`(서버) + provider(클라이언트)로 바꾼다. 소비자의 import 자리는 안 바뀐다.
 */
export { en as m } from "@/messages/en";
export type Messages = typeof import("@/messages/en").en;

/**
 * 사전에서 문구 하나를 꺼낸다 — **모르는 키에는 항상 폴백 문자열**이다.
 *
 * ⚠️ **`DICT[key] ?? fallback`을 쓰지 않는다** (2026-09-08 code-review 🔴1). 프로토타입 키
 * (`constructor`·`toString`·`valueOf`·`hasOwnProperty`)는 `Object.prototype`에서 **값이 찾아지므로**
 * `??`가 안 걸리고 문자열 자리에 **함수**가 돌아간다. 그 값이 JSX 자식이 되면 화면이 통째로 죽는데,
 * 이 경로는 `?e=`를 그대로 넘기는 초대 화면(**외부인이 여는 페이지**)에서 주소창으로 도달 가능하다.
 *
 * `typeof` 검사가 함께 있는 이유: 사전에 **함수 값**(카운터·노드 삽입)이 섞여 있어서, 갈래 이름이
 * 그런 키와 겹치면 같은 사고가 난다.
 */
export function pick(dict: Record<string, unknown>, key: string, fallback: string): string {
  const value = Object.hasOwn(dict, key) ? dict[key] : undefined;
  return typeof value === "string" ? value : fallback;
}
