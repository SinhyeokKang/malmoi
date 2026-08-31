import { describe, expect, it } from "vitest";
import { SaveInput, planSave } from "../save";

describe("planSave — 저장 판정", () => {
  it("값이 없던 곳에 값이 오면 upsert", () => {
    expect(planSave(null, "번역")).toEqual({ action: "upsert", value: "번역" });
  });

  it("값이 바뀌면 upsert", () => {
    expect(planSave("옛값", "새값")).toEqual({ action: "upsert", value: "새값" });
  });

  it("값이 같으면 noop — 불필요한 쓰기와 updatedAt 갱신을 막는다", () => {
    expect(planSave("같은값", "같은값")).toEqual({ action: "noop" });
  });

  it("앞뒤 공백을 보존한다 — 번역에 의미 있는 공백이 있을 수 있다", () => {
    expect(planSave(null, " 앞뒤 공백 ")).toEqual({ action: "upsert", value: " 앞뒤 공백 " });
    expect(planSave(" 앞뒤 공백 ", " 앞뒤 공백 ")).toEqual({ action: "noop" });
  });
});

describe("planSave — 값을 지우는 경우", () => {
  // ⚠️ 행을 **삭제하지 않는다**. push가 `INSERT ... ON CONFLICT DO NOTHING`이라,
  // 행이 사라지면 다음 push가 리포 파일의 값으로 **되살린다** — 사용자가 지운 것이 무음으로
  // 되돌아간다. 빈 문자열로 남기면 행이 존재해 DO NOTHING이 건드리지 않는다.
  it("빈 문자열 저장은 행 삭제가 아니라 value=\"\" upsert다", () => {
    expect(planSave("있던값", "")).toEqual({ action: "upsert", value: "" });
  });

  it("공백만 입력도 빈 문자열로 정규화한다", () => {
    expect(planSave("있던값", "   ")).toEqual({ action: "upsert", value: "" });
    expect(planSave("있던값", "\n\t ")).toEqual({ action: "upsert", value: "" });
  });

  it("이미 빈 문자열인데 공백만 오면 noop", () => {
    expect(planSave("", "  ")).toEqual({ action: "noop" });
    expect(planSave("", "")).toEqual({ action: "noop" });
  });

  it("행이 없는데 빈 값이 오면 noop — 미번역을 미번역으로 저장할 이유가 없다", () => {
    expect(planSave(null, "")).toEqual({ action: "noop" });
    expect(planSave(null, "   ")).toEqual({ action: "noop" });
  });

  it("planSave가 delete를 만들지 않는다 (계약)", () => {
    const actions = [
      planSave(null, "v"), planSave("a", "b"), planSave("a", ""),
      planSave("", ""), planSave(null, ""),
    ].map((p) => p.action);
    expect(actions).not.toContain("delete");
    expect(new Set(actions)).toEqual(new Set(["upsert", "noop"]));
  });
});

describe("SaveInput 검증 — Server Action은 공개 엔드포인트다", () => {
  const valid = { keyId: "c".repeat(25), localeCode: "ko", value: "값" };

  it("정상 입력을 통과시킨다", () => {
    expect(SaveInput.safeParse(valid).success).toBe(true);
  });

  it("빈 값도 통과시킨다 — 지우기가 정당한 조작이다", () => {
    expect(SaveInput.safeParse({ ...valid, value: "" }).success).toBe(true);
  });

  it("keyId가 비면 거부", () => {
    expect(SaveInput.safeParse({ ...valid, keyId: "" }).success).toBe(false);
  });

  it("localeCode가 비면 거부", () => {
    expect(SaveInput.safeParse({ ...valid, localeCode: "" }).success).toBe(false);
  });

  it("value가 문자열이 아니면 거부", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(SaveInput.safeParse({ ...valid, value }).success).toBe(false);
    }
  });

  it("과도하게 긴 값은 거부한다 — 공개 엔드포인트라 크기 상한이 필요하다", () => {
    expect(SaveInput.safeParse({ ...valid, value: "x".repeat(10_001) }).success).toBe(false);
    expect(SaveInput.safeParse({ ...valid, value: "x".repeat(10_000) }).success).toBe(true);
  });
});
