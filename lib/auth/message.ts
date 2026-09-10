import { m, pick } from "@/lib/i18n";

/**
 * 인가 거부 → 사용자 문구. 문구는 사전(`messages/en.tsx`)이 들고, **케이스 누락은 `satisfies
 * Record<Union, string>`이 컴파일 타임에 막는다** — 갈래를 늘리면 사전에 키가 없어 빌드가 깨진다.
 *
 * ⚠️ 이게 필요한 이유: DB 세션에서 "권한 회수가 즉시 반영된다"는 성질은 사용자에게
 * **blur 저장 실패 한 줄로만** 드러난다. 그 자리에 `unauthorized`라는 영어 토큰이 뜨면 번역
 * 편집자는 무슨 일이 일어났는지 알 수 없다 — 읽는 사람은 비개발자 동료다 (SAAS §3).
 */

export type AccessError =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  /** 마지막 OWNER를 제거·강등하려 했다 (`planMemberChange`). */
  | "last-owner"
  /** 대상이 그 프로젝트의 멤버가 아니다 — "성공"으로 접지 않는다. */
  | "not-member"
  /** 세션을 **못 읽었다** — 거부가 아니라 장애다 (`lib/auth/outage.ts`). 로그인을 시키면 헛로그인이다. */
  | "unavailable"
  /**
   * 프로젝트가 보관됐다 (7단계). **`forbidden`과 가른다** — 권한은 그대로이고 프로젝트가 멈춘
   * 것이라, "권한이 없다"고 말하면 사용자가 OWNER에게 권한을 달라고 하게 된다.
   */
  | "archived";

const ACCESS_ERRORS: ReadonlySet<string> = new Set<AccessError>([
  "unauthorized",
  "forbidden",
  "not-found",
  "last-owner",
  "not-member",
  "unavailable",
  "archived",
]);

/**
 * 화면이 `error: string`을 받아 문구를 고를 때의 판정. 전에는 화면 셋이 각자 `Set`을 들고 `as AccessError`로
 * 단언했다 — 사유가 늘면 셋 중 하나가 빠진다. `satisfies` 검사로 union과 목록이 같은 크기임을 강제하지는
 * 못하므로, 아래 `ACCESS`의 `satisfies`와 `lib/auth/__tests__/message.test.ts`가 함께 본다.
 */
export function isAccessError(value: unknown): value is AccessError {
  return typeof value === "string" && ACCESS_ERRORS.has(value);
}

/**
 * 갈래가 늘면 **사전에 키가 없어 컴파일 에러**다 — 지금까지의 `never` 검사와 같은 힘이고 코드는 줄어든다.
 * 던져도 되는 이유는 인자가 우리 코드가 만든 값만 들어오기 때문이다(아래 둘과 다르다).
 */
const ACCESS = m.errors.access satisfies Record<AccessError, string>;

export function accessErrorMessage(error: AccessError): string {
  return ACCESS[error];
}

/**
 * 초대 수락 실패 사유 → 사용자 문구.
 *
 * ⚠️ **`AcceptResult.error`가 `string`이면 이 함수가 무의미하다** — 사유를 늘려도 컴파일러가
 * 아무 말을 안 한다. 그래서 union으로 좁혀 두고, 아래 `satisfies`가 누락을 잡는다.
 */
export type InviteError =
  /** 세션이 없거나 만료됐다. 링크만으로는 들어올 수 없다. */
  | "unauthorized"
  /** 해시로 행을 못 찾았다 — 잘못된 링크이거나 취소된 초대다. */
  | "not-found"
  | "expired"
  /** 단일 사용을 이미 소진했다 (`updateMany … acceptedAt: null`의 count가 0). */
  | "already-accepted"
  /** provider가 검증한 이메일이 초대 대상과 다르다 (SAAS §5.6). */
  | "email-mismatch"
  /** 이미 그 프로젝트의 멤버다 — 실패지만 원하는 상태는 이미 이뤄져 있다. */
  | "already-member"
  /** 세션을 못 읽었다 — 거부가 아니다. */
  | "unavailable";

/**
 * ⚠️ **여섯 중 셋은 여기서만 사용자에게 보인다.** `not-found`·`already-accepted`·`expired`는 페이지가
 * 서버 렌더 단계에서 갈라 각자 화면을 내지만, **수락 버튼을 눌러서 나는 실패**(`email-mismatch`·
 * `already-member`·`unauthorized`)는 이 문구가 없으면 어디에도 나타나지 않는다 — 2026-09-06까지
 * 실제로 그랬고, 사용자에게는 버튼이 안 눌린 것으로 보였다 (POSTMORTEM 2026-09-06).
 *
 * ⚠️ **모르는 값에 던지지 않는다.** `?e=`는 주소창에 있어 사용자가 손댈 수 있다 — 던지면 초대 화면이
 * 통째로 죽고, 그건 외부인이 여는 화면이다. `accessErrorMessage`가 던져도 되는 것과 다르다(그쪽 인자는
 * 우리 코드가 만든 값만 들어온다).
 */
const INVITE = m.errors.invite satisfies Record<InviteError | "fallback", string>;

/**
 * ⚠️ **인자가 `string`이다 — `InviteError`가 아니다** (2026-09-08). 이 함수의 계약은 "모르는 값에
 * 폴백"이고 구현도 그렇게 돼 있는데 타입만 좁아서, 유일한 호출부(초대 화면)가 주소창 값에
 * `as InviteError`를 걸고 있었다 — **단언은 그 계약을 검사에서 지우는 것이다.** `signInErrorMessage`가
 * 같은 이유로 처음부터 `string`을 받는다.
 */
export function inviteErrorMessage(error: string): string {
  // 모르는 값은 접는다 — `?e=`는 주소창에 있어 사용자가 손댈 수 있고, 던지면 외부인이 여는 화면이 죽는다.
  return pick(INVITE, error, INVITE.fallback);
}

/**
 * Auth.js가 `pages.error`로 넘기는 `?error=` 코드 → 사용자 문구.
 *
 * ⚠️ **거부와 장애를 가른다.** 몇 번을 다시 눌러도 결과가 같은 실패에 "잠시 뒤 다시"를 보이면
 * 사용자가 같은 버튼을 반복해서 누른다 — 2026-09-05 preview 실측에서 `OAuthAccountNotLinked`가
 * 정확히 그 모양이었다. 원인이 고정된 거부는 **무엇을 하면 되는지**를 말해야 한다.
 *
 * ⚠️ **코드를 그대로 노출하지 않는다.** 읽는 사람은 비개발자 동료다 (SAAS §3).
 */
const SIGN_IN = m.errors.signIn;

export function signInErrorMessage(code: string): string {
  // Auth.js의 코드 집합은 우리 union이 아니다 — 아는 것만 갈라 말하고 나머지는 재시도로 접는다.
  // `fallback` 자체는 코드가 아니므로 사전에서 직접 꺼내 온다.
  return code === "fallback" ? SIGN_IN.fallback : pick(SIGN_IN, code, SIGN_IN.fallback);
}
