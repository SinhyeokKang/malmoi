import { describe, expect, it } from "vitest";

import { rejectTarget, rootView } from "@/lib/auth/landing";
import { routes } from "@/lib/routes";

/**
 * 착지 판정의 계약 (8-1a).
 *
 * **축이 둘이고, 그것을 가르는 것이 이 모듈의 존재 이유다.** 실물 확인 결과 `lib/auth/session.ts`와
 * `app/(edit)/layout.tsx`는 **`unavailable`·`none` 2갈래뿐**이고 `ok` 갈래가 아예 없다 —
 * `app/page.tsx`만 `ok → /projects`를 든다. 한 함수로 접으면 `ok`를 반환하는 것이 `requireUser`
 * 자리에 꽂혀 의미가 안 맞는다. 루트의 판정은 2026-09-26에 `landingTarget`(주소)에서 `rootView`(무엇을 그리나)로
 * 바뀌었다 — 랜딩이 `/`에 섰기 때문이다.
 *
 * ⚠️ **문자열 리터럴을 여기에 박지 않는다** — `routes.*`와 대조한다. 그래야 `lib/routes.ts`가
 * 바뀔 때 이 테스트가 따라 움직인다. 경로 문자열은 타입이 못 보는 부류라(POSTMORTEM 2026-09-05)
 * 생성기와 소비자를 묶어 두는 것이 유일한 방어선이다.
 */
describe("rejectTarget — 거부·장애를 어디로 튕기나", () => {
  /**
   * ⚠️ **거부와 장애가 같은 관측값을 내면 안 된다** (POSTMORTEM 2026-09-06). `auth()`가 DB 장애를
   * `null` 세션으로 접는 바람에 전면 장애를 "정상 로그아웃"으로 읽은 전례가 있다 — `readSession`이
   * `unavailable`을 가르는 이유이고, 그 구별이 **URL까지 살아 있어야** 사용자에게 닿는다.
   */
  it("장애는 사유를 실어 보낸다 — 비로그인과 바이트 단위로 같은 응답이 되면 안 된다", () => {
    expect(rejectTarget("unavailable")).toBe(routes.signIn({ error: "Unavailable" }));
  });

  it("비로그인은 사유 없이 로그인 화면이다", () => {
    expect(rejectTarget("none")).toBe(routes.signIn());
  });

  /** 위 둘이 실제로 갈리는지 — 같은 값을 내면 위 두 케이스가 공허하게 통과한다. */
  it("두 갈래가 서로 다른 주소다", () => {
    expect(rejectTarget("unavailable")).not.toBe(rejectTarget("none"));
  });
});

describe("rootView — 루트(`/`)가 무엇을 그리나 (랜딩)", () => {
  /**
   * ⚠️ **로그인 상태로 `/`에 오면 여전히 `/projects`다** (2026-09-10 사용자 결정 — *"로그인 이후
   * 랜딩 못 가게"*). 랜딩이 `/`에 들어와도 유지한다 — 이 케이스가 그 결정의 기록이다.
   */
  it("세션이 있으면 프로젝트 목록으로 보낸다", () => {
    expect(rootView("ok")).toEqual({ redirect: routes.projects() });
  });

  it("세션이 없으면 랜딩을 그린다", () => {
    expect(rootView("none")).toEqual({ landing: true });
  });

  /**
   * ⚠️ **장애도 랜딩이다** (2026-09-26 `/feature-review` — 옛: `/signin?error=Unavailable`). 공개 화면이
   * 세션 장애로 안 열리는 것이 더 나쁘다(DESIGN §6.61과 같은 쪽). 일반 로그인은 `redirectTo: "/projects"`라
   * `/`를 지나지 않으므로 "로그인 직후 조용히 랜딩"이 되는 흐름이 없고, 장애 신호는 `rejectTarget`이 계속 든다.
   */
  it("세션을 못 읽어도 랜딩을 그린다 — 장애 신호는 보호 라우트가 든다", () => {
    expect(rootView("unavailable")).toEqual({ landing: true });
    expect(rejectTarget("unavailable")).toBe(routes.signIn({ error: "Unavailable" }));
  });
});
