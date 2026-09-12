import { describe, expect, it } from "vitest";

import { planAccountLink } from "../account-link";

/**
 * GitHub 계정 연결 판정 (design §2.3·§3.1·§4). **ARCHITECTURE §6.2.1의 방어선** — 다른 User가 이미 그 GitHub
 * 계정을 연결했으면 **병합하지 않고 거부**한다. 잘못된 자동 병합은 불편이 아니라 계정 탈취다.
 *
 * ⚠️ **유일성의 범위는 `provider: "github-app"` 안이다.** 로그인용 `github` 행이 남의 것이어도
 * 연결을 막지 않는다 — 의미가 다른 두 인가다("이 사람이 누구인가" vs "우리 App의 어느 설치를
 * 볼 수 있는가"). 그래서 이 함수는 `github-app` 행 둘만 본다.
 *
 * ⚠️ **User당 App 연결은 하나다.** 다른 GitHub 계정으로 다시 인가하면 `replace`이고, 껍데기가
 * 옛 행 삭제와 새 행 생성을 한 트랜잭션으로 묶는다.
 *
 * 판정만 하고 쓰기 규칙은 껍데기에 있다 — `link`는 `create`(P2002면 재조회), `already-linked`는
 * **토큰 컬럼만** update(`userId`는 넣지 않는다), `taken-by-other`는 **아무것도 쓰지 않는다**.
 */

describe("planAccountLink — 처음 연결", () => {
  it("그 GitHub 계정 행도 내 행도 없으면 link다", () => {
    expect(planAccountLink({ sessionUserId: "u1", existing: null, current: null })).toBe("link");
  });
});

describe("planAccountLink — 이미 내가 연결한 계정", () => {
  it("그 행이 내 것이면 already-linked다 (토큰만 갱신하면 된다)", () => {
    expect(
      planAccountLink({
        sessionUserId: "u1",
        existing: { userId: "u1" },
        current: { providerAccountId: "gh-1" },
      }),
    ).toBe("already-linked");
  });

  it("재인가로 같은 계정이 다시 와도 replace가 아니다 — 지웠다 만들 이유가 없다", () => {
    expect(
      planAccountLink({ sessionUserId: "u1", existing: { userId: "u1" }, current: null }),
    ).toBe("already-linked");
  });
});

describe("planAccountLink — 다른 User가 이미 연결한 계정 (ARCHITECTURE §6.2.1)", () => {
  it("그 행이 남의 것이면 taken-by-other다 — 병합하지 않는다", () => {
    expect(
      planAccountLink({ sessionUserId: "u1", existing: { userId: "u2" }, current: null }),
    ).toBe("taken-by-other");
  });

  it("내 행이 따로 있어도 taken-by-other가 우선이다 — 남의 계정을 뺏으려다 내 연결까지 잃지 않는다", () => {
    // taken-by-other가 replace보다 앞이어야 한다. 뒤였다면 껍데기가 내 옛 행을 지운 뒤에 거부해
    // 사용자는 "실패했는데 연결이 풀렸다"를 보게 된다.
    expect(
      planAccountLink({
        sessionUserId: "u1",
        existing: { userId: "u2" },
        current: { providerAccountId: "gh-old" },
      }),
    ).toBe("taken-by-other");
  });
});

describe("planAccountLink — 다른 GitHub 계정으로 갈아타기", () => {
  it("그 GitHub 계정 행은 없고 내 행이 다른 계정이면 replace다", () => {
    expect(
      planAccountLink({
        sessionUserId: "u1",
        existing: null,
        current: { providerAccountId: "gh-old" },
      }),
    ).toBe("replace");
  });
});

describe("planAccountLink — userId만 본다", () => {
  it("이메일·핸들 같은 다른 축으로 병합하지 않는다 — 입력에 그런 축이 아예 없다", () => {
    // `allowDangerousEmailAccountLinking`이 어디에도 없는 것과 같은 방어선이다
    // (`lib/auth/__tests__/provider-config.test.ts`가 그쪽을 검사한다).
    const takenByOther = planAccountLink({
      sessionUserId: "same-email-different-user",
      existing: { userId: "owner-of-that-github-account" },
      current: null,
    });
    expect(takenByOther).toBe("taken-by-other");
  });
});
