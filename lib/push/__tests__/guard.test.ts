import { describe, expect, it } from "vitest";
import { checkArchived, checkCommitOrder, checkFormat, checkProjectSlug, guardStatus, isBaseLocaleChange } from "../guard";

const at = (iso: string) => new Date(iso);

describe("checkProjectSlug — 오배송 거부", () => {
  it("페이로드 slug가 운영 대상과 같으면 통과", () => {
    expect(checkProjectSlug("skillflo", "skillflo")).toBe("ok");
  });

  it("다르면 거부한다 — 남의 프로젝트에 적용되면 키가 전부 orphan되고 되돌릴 수 없다", () => {
    expect(checkProjectSlug("bugshot-2", "skillflo")).toBe("wrong-project");
  });

  it("앞뒤 공백은 무시한다 — Actions가 개행을 흘릴 수 있다", () => {
    expect(checkProjectSlug(" skillflo\n", "skillflo")).toBe("ok");
  });

  it("부분 일치는 거부한다", () => {
    expect(checkProjectSlug("skill", "skillflo")).toBe("wrong-project");
    expect(checkProjectSlug("skillflo-2", "skillflo")).toBe("wrong-project");
  });

  it("대소문자가 다르면 거부한다 — slug는 우리가 정한 식별자라 GitHub 핸들과 달리 정확 일치다", () => {
    expect(checkProjectSlug("SkillFlo", "skillflo")).toBe("wrong-project");
  });

  it("⚠️ 양쪽이 다 비어도 통과시키지 않는다 (fail-closed 이중 차단)", () => {
    // lib/auth/allow.ts와 같은 원리 — 빈 값끼리의 일치를 통과로 읽으면
    // 설정 누락이 곧 무제한 라우팅이 된다.
    expect(checkProjectSlug("", "")).toBe("wrong-project");
    expect(checkProjectSlug("   ", "  ")).toBe("wrong-project");
  });

  it("운영 대상이 비어 있으면 어떤 페이로드도 통과하지 못한다", () => {
    expect(checkProjectSlug("skillflo", "")).toBe("wrong-project");
  });

  it("페이로드 slug가 비어 있으면 거부한다", () => {
    expect(checkProjectSlug("", "skillflo")).toBe("wrong-project");
  });
});

describe("checkCommitOrder — 역행 거부", () => {
  const last = at("2026-08-31T10:00:00Z");

  it("더 새로운 커밋은 통과", () => {
    expect(checkCommitOrder(at("2026-08-31T10:00:01Z"), last)).toBe("ok");
  });

  it("**같은 시각은 통과한다** — 같은 커밋 재전송은 strict에서 결과가 같고 정당하다", () => {
    expect(checkCommitOrder(at("2026-08-31T10:00:00Z"), last)).toBe("ok");
  });

  it("과거 커밋은 거부한다 — 오래된 run의 Re-run이 DB를 그 시점으로 되돌린다", () => {
    expect(checkCommitOrder(at("2026-08-31T09:59:59Z"), last)).toBe("stale-commit");
  });

  it("1밀리초 과거도 거부한다 — 판정에 관용 구간을 두지 않는다", () => {
    expect(checkCommitOrder(at("2026-08-31T09:59:59.999Z"), last)).toBe("stale-commit");
  });

  it("첫 push(lastCommitAt이 null)는 통과", () => {
    expect(checkCommitOrder(at("2020-01-01T00:00:00Z"), null)).toBe("ok");
  });

  it("타임존이 달라도 절대 시각으로 비교한다", () => {
    // 2026-08-31T19:00:00+09:00 === 10:00:00Z — 같은 순간이므로 통과.
    expect(checkCommitOrder(at("2026-08-31T19:00:00+09:00"), last)).toBe("ok");
    // 18:59:59+09:00 === 09:59:59Z — 과거다.
    expect(checkCommitOrder(at("2026-08-31T18:59:59+09:00"), last)).toBe("stale-commit");
  });

  it("파싱 불가능한 날짜는 거부한다 — Invalid Date를 통과시키면 비교가 조용히 무너진다", () => {
    expect(checkCommitOrder(new Date("nope"), last)).toBe("stale-commit");
    expect(checkCommitOrder(new Date("nope"), null)).toBe("stale-commit");
  });
});

describe("checkFormat — 확정한 번역 표면을 CI가 다른 것으로 갈아치우지 못한다", () => {
  const stored = {
    adapterName: "code-dict",
    pathTemplate: "src/i18n/{locale}.ts",
    baseLocale: "en",
    // 선언 없음 = 옛 동작. 아래 별도 describe가 선언이 있을 때를 본다 (6b-3).
    declaredBaseLocale: null,
  };
  const payload = { adapter: "code-dict", pathTemplate: "src/i18n/{locale}.ts", baseLocale: "en" };

  it("셋이 다 같으면 통과한다", () => {
    expect(checkFormat(payload, stored)).toBe("ok");
  });

  it("아직 아무것도 저장돼 있지 않으면 통과한다 — push가 채우는 것이 옛 계약이다", () => {
    expect(
      checkFormat(payload, {
        adapterName: null,
        pathTemplate: null,
        baseLocale: null,
        declaredBaseLocale: null,
      }),
    ).toBe("ok");
  });

  /**
   * 온보딩 중에 선언만 있는 행. **"전부 비어 있다" 판정에 선언을 넣지 않는 근거다** — 넣으면 이
   * 행의 첫 push가 아래 엄격 비교로 내려가 `wrong-format`이 된다 (6b-3).
   */
  it("현실은 비어 있고 선언만 있어도 통과한다 — 첫 push가 그 값을 심는다", () => {
    expect(
      checkFormat(payload, {
        adapterName: null,
        pathTemplate: null,
        baseLocale: null,
        declaredBaseLocale: "ko",
      }),
    ).toBe("ok");
  });

  /**
   * ⚠️ **이것이 이 판정을 만든 이유다.** 온보딩이 2순위 후보(code-dict)로 확정했는데 자동 후보의
   * 워크플로 YAML은 `adapter:`를 박지 않고, `push:local`은 그때 `detectFormat`으로 **1순위**(yaml-catalog)를
   * 고른다. 막지 않으면 strict push가 그 프로젝트의 키를 전부 orphan시키고 이물 키를 넣는데
   * `PushPlan`에 `toDelete`가 없어 되돌릴 수 없다.
   */
  it("어댑터가 다르면 거부한다 — 1순위 탐지가 확정한 표면을 덮는 경로다", () => {
    expect(checkFormat({ ...payload, adapter: "yaml-catalog" }, stored)).toBe("wrong-format");
  });

  it("같은 어댑터라도 경로 템플릿이 다르면 거부한다 — 한 리포에 표면이 둘이면 어댑터로는 안 갈린다", () => {
    expect(checkFormat({ ...payload, pathTemplate: "locales/{locale}.ts" }, stored)).toBe("wrong-format");
  });

  /**
   * 기준 로케일은 **키 집합의 진실**이다. 온보딩이 라디오로 `ko`를 확정했는데 CI가 `--base` 없이
   * 돌면 `pickBaseLocale`이 `en`을 고르고, 진짜 base에만 있는 키가 적재에서 빠져 orphaned로 떨어진다
   * (2026-09-04 audit #1과 같은 손실).
   */
  it("기준 로케일이 다르면 거부한다 — 키 집합이 바뀌어 진짜 base의 키가 orphan된다", () => {
    expect(checkFormat({ ...payload, baseLocale: "ko" }, stored)).toBe("wrong-format");
  });

  it("일부만 저장돼 있으면 거부한다 (fail-closed) — 셋은 항상 함께 쓰이므로 그 상태는 이해할 수 없다", () => {
    expect(checkFormat(payload, { ...stored, baseLocale: null })).toBe("wrong-format");
    expect(checkFormat(payload, { ...stored, adapterName: null })).toBe("wrong-format");
    expect(checkFormat(payload, { ...stored, pathTemplate: null })).toBe("wrong-format");
  });

  it("공백을 관용하지 않는다 — 이 값들은 셸 치환이 아니라 탐지 결과에서 온다", () => {
    expect(checkFormat({ ...payload, pathTemplate: " src/i18n/{locale}.ts" }, stored)).toBe("wrong-format");
  });
});

describe("guardStatus", () => {
  it("거부는 409다 — 페이로드 형식이 아니라 상태 충돌이라 400이 아니다", () => {
    expect(guardStatus("wrong-project")).toBe(409);
    expect(guardStatus("stale-commit")).toBe(409);
    expect(guardStatus("wrong-format")).toBe(409);
  });

  it("통과는 200", () => {
    expect(guardStatus("ok")).toBe(200);
  });
});

/**
 * **OWNER가 선언한 base는 받아들인다** (ARCHITECTURE §5.5.5, 6b-3).
 *
 * `Project.declaredBaseLocale`은 "다음 CI push가 이 base를 가져오면 받아들이겠다"는 **일회용
 * 허가**다. 그것이 없으면 base를 바꾸는 순간 그 리포의 push가 영영 409이고(워크플로를 고쳐도
 * 저장값은 옛 base다) 되돌릴 방법이 DB 직접 수정뿐이다.
 *
 * ⚠️ **느슨해지는 것은 base 하나다.** `adapter`·`pathTemplate`은 그대로 엄격하고, 오배송(다른
 * 리포가 우리 토큰으로 push)을 막는 것은 그 둘이다 — 아래 마지막 케이스가 그 성질을 고정한다.
 */
describe("checkFormat — 선언한 base도 받아들인다 (6b-3)", () => {
  const stored = {
    adapterName: "code-dict",
    pathTemplate: "src/i18n/{locale}.ts",
    baseLocale: "en",
    declaredBaseLocale: "ko",
  };
  const payload = { adapter: "code-dict", pathTemplate: "src/i18n/{locale}.ts", baseLocale: "en" };

  it("현실과 같으면 통과한다 — 대기 중에도 옛 base 워크플로가 계속 돈다", () => {
    expect(checkFormat(payload, stored)).toBe("ok");
  });

  it("선언과 같으면 통과한다 — 워크플로를 고친 첫 push가 여기로 온다", () => {
    expect(checkFormat({ ...payload, baseLocale: "ko" }, stored)).toBe("ok");
  });

  it("둘 다 아니면 wrong-format이다", () => {
    expect(checkFormat({ ...payload, baseLocale: "fr" }, stored)).toBe("wrong-format");
  });

  it("선언이 없으면 옛 동작 그대로다", () => {
    const noDecl = { ...stored, declaredBaseLocale: null };
    expect(checkFormat({ ...payload, baseLocale: "ko" }, noDecl)).toBe("wrong-format");
  });

  it("⚠️ 느슨해진 것은 base 하나다 — adapter가 다르면 선언과 무관하게 거부다", () => {
    expect(checkFormat({ ...payload, adapter: "yaml-catalog", baseLocale: "ko" }, stored)).toBe("wrong-format");
    expect(checkFormat({ ...payload, pathTemplate: "other/{locale}.ts", baseLocale: "ko" }, stored)).toBe("wrong-format");
  });
});

/**
 * **base가 바뀌는 push인가** — `planPush`가 `needsReview` 전파를 건너뛸지 정한다 (ARCHITECTURE §5.5.5).
 */
describe("isBaseLocaleChange", () => {
  it("저장값과 다르면 변경이다", () => {
    expect(isBaseLocaleChange("ko", "en")).toBe(true);
  });

  it("같으면 변경이 아니다", () => {
    expect(isBaseLocaleChange("en", "en")).toBe(false);
  });

  /** 첫 push다 — 비교 대상이 없고 기존 키도 없으므로 전파할 것이 애초에 없다. */
  it("저장값이 없으면 변경이 아니다", () => {
    expect(isBaseLocaleChange("en", null)).toBe(false);
  });
});

/**
 * **보관 중 CI push는 409** (7단계 — PRODUCT §7.9).
 *
 * 보관의 뜻이 "멈춘다"인데 리포가 계속 덮으면 **보관 중에 번역이 조용히 바뀐다** — strict push라
 * 그 덮어쓰기는 되돌릴 수 없다. 대상 리포 CI가 red가 되는 것은 의도된 신호다(워크플로를 떼라는 뜻).
 */
describe("checkArchived — 멈춘 프로젝트는 push도 안 받는다", () => {
  it("보관되지 않았으면 통과다", () => {
    expect(checkArchived(null)).toBe("ok");
  });

  it("보관됐으면 거부다", () => {
    expect(checkArchived(new Date("2026-09-10T00:00:00Z"))).toBe("archived");
  });

  it("거부는 409다 — 페이로드 형식이 아니라 서버 상태와의 충돌이다", () => {
    expect(guardStatus(checkArchived(new Date("2026-09-10T00:00:00Z")))).toBe(409);
  });
});
