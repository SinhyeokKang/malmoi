import { describe, expect, it } from "vitest";

import { landingTarget, rejectTarget } from "@/lib/auth/landing";
import { routes } from "@/lib/routes";

/**
 * 착지 판정의 계약 (8-1a T1 — `features/ui-rework/signin-auth/design.md` §3).
 *
 * **축이 둘이고, 그것을 가르는 것이 이 모듈의 존재 이유다.** 실물 확인 결과 `lib/auth/session.ts`와
 * `app/(edit)/layout.tsx`는 **`unavailable`·`none` 2갈래뿐**이고 `ok` 갈래가 아예 없다 —
 * `app/page.tsx`만 `ok → /projects`를 든다. 한 함수로 접으면 `ok`를 반환하는 것이 `requireUser`
 * 자리에 꽂혀 의미가 안 맞는다.
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

describe("landingTarget — 루트(`/`)의 착지", () => {
  /**
   * ⚠️ **로그인 상태로 `/`에 오면 `/projects`다** (2026-09-10 사용자 결정 — *"로그인 이후 랜딩
   * 못 가게"*). **랜딩이 `/`에 들어온 뒤에도 유지한다** — 이 케이스가 그 결정의 기록이고, 없으면
   * 다음 배송이 "로그인해도 랜딩을 볼 수 있어야 한다"로 뒤집는다.
   */
  it("세션이 있으면 프로젝트 목록으로 — 로그인 화면을 두 번 보여줄 이유가 없다", () => {
    expect(landingTarget("ok")).toBe(routes.projects());
  });

  /**
   * **위임을 값으로 고정한다.** 두 함수가 각자 갈래를 적으면 목적지가 바뀔 때 하나만 고쳐지고,
   * 그 어긋남은 화면이 정상으로 보이므로 눈에 안 띈다.
   */
  it("세션이 없거나 못 읽으면 rejectTarget과 같은 곳으로 간다", () => {
    expect(landingTarget("none")).toBe(rejectTarget("none"));
    expect(landingTarget("unavailable")).toBe(rejectTarget("unavailable"));
  });

  it("세 갈래가 전부 다른 주소다 — 하나로 접히면 구별이 사라진다", () => {
    const seen = new Set([landingTarget("ok"), landingTarget("none"), landingTarget("unavailable")]);
    expect(seen.size).toBe(3);
  });
});
