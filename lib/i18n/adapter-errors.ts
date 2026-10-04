import type { AdapterError, AdapterErrorCode } from "@/lib/adapters/types";
import type { Messages } from "@/lib/i18n";
import type { PullWarning } from "@/lib/pull/run";
import { en } from "@/messages/en";

/**
 * 갈래 누락을 **컴파일 타임에** 잡는다 — 사전이 잎이라 union을 그쪽에서 import할 수 없으므로
 * 소비자가 `satisfies`를 건다 (CLAUDE.md 코드 컨벤션). `accessErrorMessage`·`inviteErrorMessage`·`connectErrorMessage`·`onboardErrorMessage`와
 * 같은 형이고, 이것이 옛 `never` 검사가 하던 일이다.
 */
const ADAPTER = en.adapterErrors satisfies Record<AdapterErrorCode | "fallback", string>;

/**
 * **어댑터 오류 하나를 사람이 읽는 한 줄로.** 문장은 사전이 내고 어댑터는 코드만 준다
 * (CLAUDE.md 코드 컨벤션, 6b-1).
 *
 * ⚠️ **잎이어야 한다** — 온보딩의 클라이언트 컴포넌트 둘이 이걸 읽으므로 import 그래프가 곧 번들이다.
 * `@/lib/adapters/types`는 **타입만** 가져온다(값으로 끌어오면 `ADAPTER_ERROR_CODES`를 따라
 * 그 디렉터리가 열린다). `components/__tests__/client-graph.test.ts`가 상시로 센다.
 *
 * ⚠️ **`DICT[code]`를 그대로 쓰지 않는다.** 이 값은 Server Action 반환을 타고 클라이언트로 가는데,
 * 프로토타입 키(`constructor`·`toString`)가 코드 자리에 오면 `Object.prototype`에서 **함수**가
 * 찾아져 문자열 자리에 들어간다 (POSTMORTEM 2026-09-08 🔴1 — `pick`이 존재하는 이유).
 *
 * `sentences`는 그 화면 언어의 `adapterErrors` 절이다 — 영어로 고정되는 표면(MCP·cron)은 `en.adapterErrors`를 명시한다.
 * ⚠️ 기본값(en)은 이행 중에만 있다(ui-locales design §3.4).
 */
export function adapterErrorMessage(error: AdapterError, sentences: Messages["adapterErrors"] = ADAPTER): string {
  const sentence = Object.hasOwn(sentences, error.code) ? sentences[error.code] : undefined;
  const base = typeof sentence === "string" ? sentence : sentences.fallback;
  // `key`는 **행동 가능한 정보**라 앞에 온다 — 903키 파일에서 "어느 키인가"가 유일한 단서다.
  // `detail`은 파서 원문이라 뒤에 접어 붙인다(사전 밖 — 번역 대상이 아니다).
  const withKey = error.key === undefined ? base : `${error.key} — ${base}`;
  return error.detail === undefined ? withKey : `${withKey} (${error.detail})`;
}

/**
 * pull 경고 한 줄 — `표면: 파일: 문장`. 실행은 코드만 싣고(`PullWarning`, ui-locales B1′) 문장은 받는 쪽이 여기서 조립한다.
 */
export function pullWarningLine(warning: PullWarning, sentences: Messages["adapterErrors"] = ADAPTER): string {
  return `${warning.surfaceSlug}: ${warning.path}: ${adapterErrorMessage(warning, sentences)}`;
}

/** `withWarningLines`가 돌려주는 모양 — `writer-warnings` 갈래만 경고가 문장 배열이 되고 나머지 갈래는 그대로다. */
export type WithWarningLines<T> = T extends { reason: "writer-warnings"; warnings: readonly PullWarning[] } ? Omit<T, "warnings"> & { warnings: string[] } : T;

/**
 * **외부 계약은 경고를 문장으로 싣는다** — MCP `publish` 응답과 `/api/pull` cron JSON은 코드로 바뀌기 전에도 영어 문장이었다.
 * 그 층이 결과를 내보내기 직전에 이것을 부른다(`lib/pull`이 사전을 읽지 않으므로 조립 자리가 거기다). 다른 갈래는 손대지 않는다.
 */
export function withWarningLines<T extends object>(value: T, sentences: Messages["adapterErrors"]): WithWarningLines<T> {
  if ("reason" in value && value.reason === "writer-warnings" && "warnings" in value && Array.isArray(value.warnings)) {
    return { ...value, warnings: (value.warnings as PullWarning[]).map((warning) => pullWarningLine(warning, sentences)) } as WithWarningLines<T>;
  }
  return value as WithWarningLines<T>;
}
