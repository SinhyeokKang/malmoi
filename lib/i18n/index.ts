/**
 * 사전의 타입 입구 — 화면 코드는 `m.translations.publish.nothing`처럼 읽고, `as const`라 그 접근 자체가 타입 검사다.
 *
 * ⚠️ **잎 모듈이다** — `@/lib/**`를 하나도 import하지 않는다. 클라이언트 컴포넌트가 이것을 읽으므로
 * 그래프가 곧 번들이다 (`components/__tests__/client-graph.test.ts`).
 *
 * 서버는 `getMessages()`(`lib/i18n/server.ts`), 클라이언트는 `useMessages()`(`components/i18n/messages-provider.tsx`)로
 * 요청의 언어를 읽는다.
 */
type En = typeof import("@/messages/en").en;

/**
 * en은 `as const`라 값이 리터럴 타입이다 — 그대로면 번역 사전이 `satisfies`를 통과할 수 없어 리터럴만 넓힌다.
 * ⚠️ **함수는 재귀하지 않고 문자열 반환만 넓힌다** — `ReactNode` 반환형을 객체로 보고 재귀하면 `ReactElement` 구조를 매핑해 버린다.
 * 객체 갈래가 튜플도 받는다(동형 매핑이라 길이가 남는다).
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (...args: infer A) => infer R
        ? (...args: A) => R extends string ? string : R
        : T extends object
          ? { readonly [K in keyof T]: Widen<T[K]> }
          : T;

type Full = Widen<En>;

/**
 * 번역 사전(ko·es)이 맞출 모양. **영어로 고정되는 네임스페이스는 뺀다** — MCP 도구 응답(`mcp`)·SEO 메타(`seo`)·
 * 루트 레이아웃 밖 오류 화면(`crash`)·방침 본문(`publicDocs.privacy` — ko 본은 `messages/ko-privacy.tsx`)은
 * 소비자가 `@/messages/en`을 명시해 읽는다(ui-locales orch D2).
 */
export type Messages = Omit<Full, "mcp" | "seo" | "crash" | "publicDocs"> & {
  readonly publicDocs: Omit<Full["publicDocs"], "privacy">;
};

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
