import { describe, expect, it } from "vitest";
import { confirmationValid, deliveryContextFingerprint, type DeliveryContextInput } from "../context";

/**
 * 전달 확인의 context 지문 (translation-rework T6·T7 — ARCHITECTURE §5.8).
 *
 * 확인 뒤 이 값이 바뀌면 그 확인은 복원 근거가 아니다. `importRevision`이 성공한 strict 적재·수동 Sync마다 **증가만** 하므로
 * 적재 쪽 무효화는 이 지문이 든다 — 되돌아가 옛 기준이 부활할 수 없다. 되돌릴 수 있는 설정(브랜치·리포)은 명시 무효화가 따로 막는다.
 */
const base: DeliveryContextInput = {
  repoHost: "github",
  repositoryId: "100",
  baseBranch: "main",
  surface: { id: "s1", importRevision: 3, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en" },
};

describe("deliveryContextFingerprint", () => {
  /**
   * ⚠️ **저장된 GitHub 행의 바이트를 고정한다** (gitlab-repositories tasks §1). 이 지문은 `DeliveryConfirmation.contextFingerprint`에 **저장**된다 —
   * 리포 호스트를 입력에 더하면서 GitHub 행의 바이트가 바뀌면 기존 확인이 전부 조용히 무효가 되어 Revert 기준이 사라진다.
   */
  it("기존 GitHub 지문은 바이트 그대로다", () => {
    expect(deliveryContextFingerprint(base)).toBe("e9b4d80c75530e9f5b56b1aa9b475a914c7653c77f20863cc89ce64bcbe4bba2");
  });

  it("⚠️ 같은 숫자 id라도 GitLab이면 다른 지문이다 — 호스트는 GitHub이 아닐 때만 섞는다", () => {
    const gitlab = deliveryContextFingerprint({ ...base, repoHost: "gitlab" });
    expect(gitlab).toMatch(/^[0-9a-f]{64}$/);
    expect(gitlab).not.toBe(deliveryContextFingerprint(base));
  });

  it("같은 입력은 같은 지문이다", () => {
    expect(deliveryContextFingerprint(base)).toBe(deliveryContextFingerprint({ ...base, surface: { ...base.surface } }));
    expect(deliveryContextFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("복원 의미를 바꾸는 축이 하나라도 바뀌면 지문이 바뀐다", () => {
    const variants: DeliveryContextInput[] = [
      { ...base, repositoryId: "200" },
      { ...base, repositoryId: null },
      { ...base, baseBranch: "dev" },
      { ...base, surface: { ...base.surface, id: "s2" } },
      { ...base, surface: { ...base.surface, importRevision: 4 } },
      { ...base, surface: { ...base.surface, adapterName: "yaml-catalog" } },
      { ...base, surface: { ...base.surface, pathTemplate: "locales/{locale}.json" } },
      { ...base, surface: { ...base.surface, nested: true } },
      { ...base, surface: { ...base.surface, nestedByPath: { "a.json": true } } },
      { ...base, surface: { ...base.surface, baseLocale: "ko" } },
    ];
    const seen = new Set([deliveryContextFingerprint(base), ...variants.map(deliveryContextFingerprint)]);
    expect(seen.size).toBe(variants.length + 1);
  });

  it("경계가 움직인 입력을 같은 문자열로 접지 않는다", () => {
    const a = deliveryContextFingerprint({ ...base, baseBranch: "a|b", surface: { ...base.surface, pathTemplate: "c" } });
    const b = deliveryContextFingerprint({ ...base, baseBranch: "a", surface: { ...base.surface, pathTemplate: "b|c" } });
    expect(a).not.toBe(b);
  });

  it("nestedByPath의 키 순서는 지문을 바꾸지 않는다 — JSON 컬럼이 순서를 보장하지 않는다", () => {
    const a = deliveryContextFingerprint({ ...base, surface: { ...base.surface, nestedByPath: { "a.json": true, "b.json": false } } });
    const b = deliveryContextFingerprint({ ...base, surface: { ...base.surface, nestedByPath: { "b.json": false, "a.json": true } } });
    expect(a).toBe(b);
  });
});

describe("confirmationValid", () => {
  const current = deliveryContextFingerprint(base);

  it("행이 없으면 유효하지 않다 — 한 번도 확인된 적 없다", () => {
    expect(confirmationValid(null, current)).toBe(false);
  });

  it("무효화 표시가 있으면 지문이 같아도 유효하지 않다 — 설정을 되돌려도 부활하지 않는다", () => {
    expect(confirmationValid({ invalidatedAt: new Date(), contextFingerprint: current }, current)).toBe(false);
  });

  it("지문이 현재와 다르면 유효하지 않다", () => {
    expect(confirmationValid({ invalidatedAt: null, contextFingerprint: "old" }, current)).toBe(false);
  });

  it("무효화가 없고 지문이 같을 때만 유효하다", () => {
    expect(confirmationValid({ invalidatedAt: null, contextFingerprint: current }, current)).toBe(true);
  });
});
