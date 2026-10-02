import { describe, expect, it } from "vitest";

import { hueOf, HUES } from "../hue";

/**
 * 이름 → 색의 순수 판정 (2026-09-11). 사용자 아바타와 프로젝트 아이콘이 함께 쓴다. **계약의 절반이 "같은 이름 = 같은 색"**이다 —
 * 렌더마다 바뀌면 색이 사람을 가리키지 못한다.
 */
describe("hueOf", () => {
  it("같은 이름은 언제나 같은 색이다", () => {
    expect(hueOf("Sinhyeok")).toBe(hueOf("Sinhyeok"));
    expect(hueOf("말모이")).toBe(hueOf("말모이"));
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(hueOf("  Sinhyeok  ")).toBe(hueOf("Sinhyeok"));
  });

  it("언제나 등재된 색 중 하나를 낸다", () => {
    const names = ["a", "b", "", "말모이", "🙂", "user@example.com", "Z".repeat(200)];
    for (const name of names) {
      expect(HUES).toContain(hueOf(name));
    }
  });

  /** ⚠️ 빈 이름도 색을 낸다 — 아바타는 `?`를 그리므로 호출부가 갈래를 하나 더 들면 안 된다. */
  it("빈 이름도 색을 낸다", () => {
    expect(HUES).toContain(hueOf(""));
    expect(HUES).toContain(hueOf("   "));
  });

  /**
   * ⚠️ **서로게이트 쌍이 두 번 섞이면 분포가 그 대역에 몰린다** — `charCodeAt`이 아니라 코드
   * 포인트로 도는 이유다. 이모지가 예외로 죽지 않는지만 본다.
   */
  it("비ASCII·이모지 이름에서도 죽지 않는다", () => {
    expect(() => hueOf("🙂🙃")).not.toThrow();
    expect(HUES).toContain(hueOf("🙂🙃"));
  });

  /**
   * 분포 — 여덟 색이 **적어도 절반은** 쓰여야 색이 사람을 가른다. 해시가 한 통에 몰리면
   * 여기서 red가 난다(값이 아니라 성질을 잰다).
   */
  it("이름 여럿을 여러 색에 흩는다", () => {
    const used = new Set(Array.from({ length: 60 }, (_, i) => hueOf(`user-${i}`)));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});

/** 색 순서나 해시가 바뀌면 기존 사람·프로젝트의 색이 바뀐다 — 개명은 값 변화 0이다. */
it("preserves palette order and existing name assignments", () => {
  expect(HUES).toEqual(["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"]);
  const assignments = [
    ["", "sky"], ["   ", "sky"], ["Sinhyeok", "orange"], ["말모이", "orange"],
    ["🙂", "fuchsia"], ["🙂🙃", "teal"], ["Acme", "fuchsia"], ["Malmoi", "indigo"],
    ["user-0", "orange"], ["user-1", "rose"], ["user-2", "emerald"], ["user-3", "amber"],
    ["user-4", "sky"], ["user-5", "teal"], ["user-6", "fuchsia"], ["user-7", "indigo"],
  ] as const;
  for (const [name, hue] of assignments) expect(hueOf(name), name).toBe(hue);
});
