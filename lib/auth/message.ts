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
  | "not-member";

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
    default: {
      // 사유를 추가하면 여기서 컴파일 에러가 난다.
      const exhaustive: never = error;
      return exhaustive;
    }
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
    default:
      // 나머지는 우리가 원인을 모른다 — 재시도가 유효한 유일한 경우다.
      return "로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.";
  }
}

