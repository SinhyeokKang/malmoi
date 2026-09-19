import { describe, expect, it } from "vitest";

import { CLASSIFIED, DISCLOSURE_SECTIONS, MODEL_CLASSES, NOT_PERSONAL } from "../collected";

/**
 * **전수 등재의 진짜 게이트는 `pnpm typecheck`이다** — `MODEL_CLASSES`가 `Record<Prisma.ModelName, …>`을
 * `satisfies`하고 `CLASSIFIED`가 mapped type이라, 모델이나 필드가 빠지면 이름이 오류 메시지에 나온다.
 *
 * ⚠️ **여기 있는 것은 그 0건 단언의 짝이다**(POSTMORTEM 2026-09-14 `:1319`) — 타입이 통과하는 **빈**
 * 등재도 green이므로 개수를 센다.
 */

describe("MODEL_CLASSES", () => {
  it("개인정보 모델이 0이 아니다", () => {
    const personal = Object.entries(MODEL_CLASSES).filter(([, kind]) => kind === "personal");

    expect(personal.length).toBeGreaterThan(0);
    expect(personal.map(([model]) => model)).toContain("User");
  });

  it("⚠️ VerificationToken은 개인정보다 — identifier에 userId와 공급자 계정 식별자가 들어 있다", () => {
    expect(MODEL_CLASSES.VerificationToken).toBe("personal");
  });
});

describe("CLASSIFIED", () => {
  it("분류된 필드가 40을 넘는다", () => {
    expect(Object.keys(CLASSIFIED).length).toBeGreaterThan(40);
  });

  it("공개 대상 필드가 가리키는 절이 전부 DISCLOSURE_SECTIONS 안이다", () => {
    const strays = Object.entries(CLASSIFIED)
      .filter(([, section]) => section !== NOT_PERSONAL)
      .filter(([, section]) => !DISCLOSURE_SECTIONS.includes(section as (typeof DISCLOSURE_SECTIONS)[number]))
      .map(([path]) => path);

    expect(strays).toEqual([]);
  });
});

/**
 * ⚠️ **역검증이다** — 등재 대상 절 목록에 이름만 남고 아무 필드도 가리키지 않으면, 본문에서 그 절을
 * 지워도 (B) 검사가 침묵한다 (`entry-points.test.ts`의 "예외 목록의 이름이 전부 실재한다"와 같은 형).
 */
describe("DISCLOSURE_SECTIONS", () => {
  it("모든 이름을 적어도 한 필드가 가리킨다", () => {
    const used = new Set(Object.values(CLASSIFIED));
    const unused = DISCLOSURE_SECTIONS.filter((section) => !used.has(section));

    expect(unused).toEqual([]);
  });

  it("중복이 없다", () => {
    expect(new Set(DISCLOSURE_SECTIONS).size).toBe(DISCLOSURE_SECTIONS.length);
  });
});
