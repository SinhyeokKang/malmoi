/**
 * 인가 거부 → 사용자 문구. `pullMessage`(`lib/pull/message.ts`)와 같은 형태다 — **케이스 누락을
 * 컴파일 타임에 막는 `never` 검사**가 아래에 있다.
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
  | "unavailable";

const ACCESS_ERRORS: ReadonlySet<string> = new Set<AccessError>([
  "unauthorized",
  "forbidden",
  "not-found",
  "last-owner",
  "not-member",
  "unavailable",
]);

/**
 * 화면이 `error: string`을 받아 문구를 고를 때의 판정. 전에는 화면 셋이 각자 `Set`을 들고 `as AccessError`로
 * 단언했다 — 사유가 늘면 셋 중 하나가 빠진다. `satisfies` 검사로 union과 목록이 같은 크기임을 강제하지는
 * 못하므로, 아래 `accessErrorMessage`의 `never` 검사와 `lib/auth/__tests__/message.test.ts`가 함께 본다.
 */
export function isAccessError(value: unknown): value is AccessError {
  return typeof value === "string" && ACCESS_ERRORS.has(value);
}

export function accessErrorMessage(error: AccessError): string {
  switch (error) {
    case "unauthorized":
      return "로그인이 만료됐어요. 다시 로그인한 뒤 저장해 주세요.";
    case "forbidden":
      // 무엇이 모자란지까지는 말하지 않는다 — 역할 이름은 내부 어휘다.
      return "이 작업을 할 권한이 없어요. 프로젝트 소유자에게 문의해 주세요.";
    case "not-found":
      // "없다"와 "멤버가 아니다"를 가르지 않는다 — 프로젝트 존재 여부를 노출하지 않는다 (SAAS §7.7).
      return "이 프로젝트에 접근할 수 없어요. 초대 링크를 다시 확인해 주세요.";
    case "last-owner":
      // 무엇을 하면 되는지 말한다 — 막힌 이유만 알려주면 사용자가 갇힌다.
      return "프로젝트에는 소유자가 한 명 이상 있어야 해요. 다른 사람을 소유자로 만든 뒤에 다시 시도해 주세요.";
    case "not-member":
      return "그 사람은 이 프로젝트의 멤버가 아니에요.";
    case "unavailable":
      // 유일하게 재시도가 맞는 사유다 — 입력값은 남아 있으니 그것을 말한다.
      return "일시적인 오류가 났어요. 잠시 뒤 다시 저장해 주세요. 입력한 값은 그대로 있어요.";
    default: {
      // 사유를 추가하면 여기서 컴파일 에러가 난다.
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

/**
 * 초대 수락 실패 사유 → 사용자 문구.
 *
 * ⚠️ **`AcceptResult.error`가 `string`이면 이 함수가 무의미하다** — 사유를 늘려도 컴파일러가
 * 아무 말을 안 한다. 그래서 union으로 좁혀 두고, 아래 `never` 검사가 누락을 잡는다.
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
export function inviteErrorMessage(error: InviteError): string {
  switch (error) {
    case "unauthorized":
      return "로그인이 풀렸어요. 다시 로그인하면 이 링크로 돌아와요.";
    case "not-found":
      return "초대를 찾을 수 없어요. 링크가 잘못됐거나 취소된 초대예요.";
    case "expired":
      return "초대가 만료됐어요. 초대한 분에게 새 링크를 요청해 주세요.";
    case "already-accepted":
      return "이미 사용된 링크예요. 초대는 한 번만 쓸 수 있어요.";
    case "email-mismatch":
      // 이 화면에서 사용자가 할 수 있는 일이 그것 하나다 — 막힌 이유만 말하면 갇힌다.
      return "초대받은 주소의 계정으로 로그인해 주세요. 지금 로그인한 계정은 초대 대상이 아니에요.";
    case "already-member":
      // 실패로 읽히지 않게 쓴다 — 원하는 상태는 이미 이뤄져 있다.
      return "이미 이 프로젝트의 멤버예요. 프로젝트 목록에서 바로 열 수 있어요.";
    case "unavailable":
      return "일시적인 오류가 났어요. 잠시 뒤 다시 눌러 주세요.";
    default:
      // 사유를 추가하면 여기서 컴파일 에러가 난다. 실행 시점의 모르는 값은 접는다(위 ⚠️).
      error satisfies never;
      return "초대를 수락하지 못했어요. 초대한 분에게 새 링크를 요청해 주세요.";
  }
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
export function signInErrorMessage(code: string): string {
  switch (code) {
    case "OAuthAccountNotLinked":
      // SAAS §5.5 — 같은 이메일이라는 이유만으로 계정을 합치지 않는다. 잘못된 자동 병합은
      // 불편이 아니라 계정 탈취다. 명시적 연결은 SaaS 4단계가 만든다.
      return "그 이메일은 이미 다른 로그인 방식으로 가입돼 있어요. 처음 쓰신 방식으로 로그인해 주세요.";
    case "AccessDenied":
      return "이 계정으로는 들어올 수 없어요. 이메일이 검증되지 않았을 수 있어요.";
    case "Unavailable":
      // Auth.js 코드가 아니라 우리 것이다 — `requireUser`가 세션을 못 읽었을 때 보낸다 (`lib/auth/outage.ts`).
      // "로그인에 실패"라고 말하지 않는다: 사용자는 로그인하려던 것이 아니라 편집 중이었다.
      return "일시적인 오류가 났어요. 잠시 뒤 다시 열어 주세요.";
    default:
      // 나머지는 우리가 원인을 모른다 — 재시도가 유효한 유일한 경우다.
      return "로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.";
  }
}

