import { describe, expect, it } from "vitest";

import { toneOf, TONES } from "../tone";

/**
 * 이름 → 색의 순수 판정 (2026-09-11). 사용자 아바타와 프로젝트 아이콘이 함께 쓴다. **계약의 절반이 "같은 이름 = 같은 색"**이다 —
 * 렌더마다 바뀌면 색이 사람을 가리키지 못한다.
 */
describe("toneOf", () => {
  it("같은 이름은 언제나 같은 색이다", () => {
    expect(toneOf("Sinhyeok")).toBe(toneOf("Sinhyeok"));
    expect(toneOf("말모이")).toBe(toneOf("말모이"));
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(toneOf("  Sinhyeok  ")).toBe(toneOf("Sinhyeok"));
  });

  it("언제나 등재된 색 중 하나를 낸다", () => {
    const names = ["a", "b", "", "말모이", "🙂", "user@example.com", "Z".repeat(200)];
    for (const name of names) {
      expect(TONES).toContain(toneOf(name));
    }
  });

  /** ⚠️ 빈 이름도 색을 낸다 — 아바타는 `?`를 그리므로 호출부가 갈래를 하나 더 들면 안 된다. */
  it("빈 이름도 색을 낸다", () => {
    expect(TONES).toContain(toneOf(""));
    expect(TONES).toContain(toneOf("   "));
  });

  /**
   * ⚠️ **서로게이트 쌍이 두 번 섞이면 분포가 그 대역에 몰린다** — `charCodeAt`이 아니라 코드
   * 포인트로 도는 이유다. 이모지가 예외로 죽지 않는지만 본다.
   */
  it("비ASCII·이모지 이름에서도 죽지 않는다", () => {
    expect(() => toneOf("🙂🙃")).not.toThrow();
    expect(TONES).toContain(toneOf("🙂🙃"));
  });

  /**
   * 분포 — 여덟 색이 **적어도 절반은** 쓰여야 색이 사람을 가른다. 해시가 한 통에 몰리면
   * 여기서 red가 난다(값이 아니라 성질을 잰다).
   */
  it("이름 여럿을 여러 색에 흩는다", () => {
    const used = new Set(Array.from({ length: 60 }, (_, i) => toneOf(`user-${i}`)));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});
