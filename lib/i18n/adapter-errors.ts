import type { AdapterError, AdapterErrorCode } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";

/**
 * 갈래 누락을 **컴파일 타임에** 잡는다 — 사전이 잎이라 union을 그쪽에서 import할 수 없으므로
 * 소비자가 `satisfies`를 건다 (translation-ui design §3.1.2). `ACCESS`·`INVITE`·`CONNECT`·`ONBOARD`와
 * 같은 형이고, 이것이 옛 `never` 검사가 하던 일이다.
 */
const ADAPTER = m.adapterErrors satisfies Record<AdapterErrorCode | "fallback", string>;

/**
 * **어댑터 오류 하나를 사람이 읽는 한 줄로.** 문장은 사전이 내고 어댑터는 코드만 준다
 * (translation-ui design §3.1.4, 6b-1).
 *
 * ⚠️ **잎이어야 한다** — 온보딩의 클라이언트 컴포넌트 둘이 이걸 읽으므로 import 그래프가 곧 번들이다.
 * `@/lib/adapters/types`는 **타입만** 가져온다(값으로 끌어오면 `ADAPTER_ERROR_CODES`를 따라
 * 그 디렉터리가 열린다). `components/__tests__/client-graph.test.ts`가 상시로 센다.
 *
 * ⚠️ **`DICT[code]`를 그대로 쓰지 않는다.** 이 값은 Server Action 반환을 타고 클라이언트로 가는데,
 * 프로토타입 키(`constructor`·`toString`)가 코드 자리에 오면 `Object.prototype`에서 **함수**가
 * 찾아져 문자열 자리에 들어간다 (POSTMORTEM 2026-09-08 🔴1 — `pick`이 존재하는 이유).
 */
export function adapterErrorMessage(error: AdapterError): string {
  const sentence = Object.hasOwn(ADAPTER, error.code) ? ADAPTER[error.code] : undefined;
  const base = typeof sentence === "string" ? sentence : ADAPTER.fallback;
  // `key`는 **행동 가능한 정보**라 앞에 온다 — 903키 파일에서 "어느 키인가"가 유일한 단서다.
  // `detail`은 파서 원문이라 뒤에 접어 붙인다(사전 밖 — 번역 대상이 아니다).
  const withKey = error.key === undefined ? base : `${error.key} — ${base}`;
  return error.detail === undefined ? withKey : `${withKey} (${error.detail})`;
}
