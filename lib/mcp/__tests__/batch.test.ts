import { describe, expect, it } from "vitest";

import { BATCH_SAVE_LIMIT, planBatchSave } from "../batch";

/**
 * `set_translations`의 입력 판정 (mcp-connector design §2.2). 한 호출에 키 최대 100개를 한 잠금·한 tx로 저장하고 키별 결과를
 * **입력 순서대로** 돌려준다 — 그래서 입력 단계에서 막을 것은 상한과 중복 둘뿐이다. 키별 거부(`not-found` 등)는 tx 안의 일이다.
 */

const entry = (keyId: string) => ({ keyId, changes: [{ localeCode: "fr", value: keyId }] });

describe("planBatchSave", () => {
  it("상한은 100이다", () => {
    expect(BATCH_SAVE_LIMIT).toBe(100);
  });

  it("입력 순서를 그대로 유지한다", () => {
    const entries = ["k3", "k1", "k2"].map(entry);
    expect(planBatchSave(entries)).toEqual({ status: "ok", entries });
  });

  it("정확히 100개는 통과", () => {
    const entries = Array.from({ length: 100 }, (_, i) => entry(`k${i}`));
    expect(planBatchSave(entries)).toMatchObject({ status: "ok" });
  });

  it("101개는 too-many — 일부만 저장하지 않는다", () => {
    const entries = Array.from({ length: 101 }, (_, i) => entry(`k${i}`));
    expect(planBatchSave(entries)).toEqual({ status: "too-many", limit: 100 });
  });

  it("빈 배열은 empty", () => {
    expect(planBatchSave([])).toEqual({ status: "empty" });
  });

  it("같은 키가 두 번이면 duplicate-key — 어느 값이 이겼는지를 판정하지 않는다", () => {
    expect(planBatchSave([entry("k1"), entry("k2"), entry("k1")])).toEqual({ status: "duplicate-key", keyId: "k1" });
  });

  it("프로토타입 이름의 키도 중복 판정이 맞다", () => {
    expect(planBatchSave([entry("__proto__"), entry("constructor")])).toMatchObject({ status: "ok" });
    expect(planBatchSave([entry("__proto__"), entry("__proto__")])).toEqual({ status: "duplicate-key", keyId: "__proto__" });
  });
});
