/**
 * GitHub 계정 연결 판정. **ARCHITECTURE §6.2.1의 방어선** — 다른 User가 이미 그 GitHub
 * 계정을 연결했으면 병합하지 않고 거부한다. 잘못된 자동 병합은 불편이 아니라 계정 탈취다.
 *
 * ⚠️ **유일성의 범위는 `provider: "github-app"` 안이다.** 로그인용 `github` 행이 남의 것이어도
 * 연결을 막지 않는다 — 의미가 다른 두 인가다("이 사람이 누구인가" vs "우리 App의 어느 설치를
 * 볼 수 있는가"). 그래서 이 함수의 입력에 이메일·핸들 같은 다른 축이 아예 없다.
 *
 * 쓰기 규칙은 껍데기에 있다: `link`는 `create`(P2002면 재조회 — 어댑터의 `linkAccount`도 `create`만
 * 한다), `already-linked`는 **토큰 컬럼만** update(`userId`는 넣지 않는다), `replace`는 옛 행 삭제와
 * 생성을 한 트랜잭션으로, `taken-by-other`는 **아무것도 쓰지 않는다**.
 */

/**
 * `Account.provider` 값 — 로그인용 `github` 행과 **같은 테이블에서 이것으로 갈린다.**
 *
 * ⚠️ 이 상수를 여기 두는 이유는 이 파일이 "그 행이 무엇인가"를 판정하는 자리라서다. 리터럴을 아직
 * 들고 있는 곳이 둘 있다(`app/api/github/callback/route.ts`·`lib/github-connect/token-store.ts`) —
 * 새로 읽는 코드는 이것을 import한다.
 */
export const APP_ACCOUNT_PROVIDER = "github-app";

export type AccountLink = "link" | "already-linked" | "replace" | "taken-by-other";

/**
 * @param existing 연결하려는 `providerAccountId`로 찾은 `github-app` 행. 없으면 null.
 * @param current 세션 User가 이미 가진 `github-app` 행. 없으면 null.
 */
export function planAccountLink(input: {
  sessionUserId: string;
  existing: { userId: string } | null;
  current: { providerAccountId: string } | null;
}): AccountLink {
  const { sessionUserId, existing, current } = input;

  if (existing !== null) {
    // ⚠️ **taken-by-other가 replace보다 앞이다.** 뒤였다면 껍데기가 내 옛 행을 지운 다음 거부해,
    // 사용자에게는 "실패했는데 연결까지 풀렸다"가 된다.
    return existing.userId === sessionUserId ? "already-linked" : "taken-by-other";
  }

  // `existing`이 없으니 `current`는 정의상 **다른** GitHub 계정이다 — 조회 키가 새 `providerAccountId`다.
  // User당 App 연결은 하나이므로 갈아타기는 교체다.
  return current !== null ? "replace" : "link";
}
