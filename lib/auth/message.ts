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
