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
