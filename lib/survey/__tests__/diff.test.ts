import { describe, expect, it } from "vitest";
import { roundtripDiffRatio } from "../diff";

/**
 * `roundtripDiffRatio` — 원본과 1차 write 출력의 **변경 줄 비율**.
 *
 * **첫 pull PR의 diff 크기 대리 지표다**.
 * 재생성 writer가 키를 항상 재정렬하므로, 원본이 정렬돼 있지 않은 리포에서는 첫 PR이 파일
 * 전체 diff로 나온다 — skillflo 1446키가 통째로 재정렬된 PR은 리뷰어가 머지하지 않는다.
 * ARCHITECTURE §1.1 "키 정렬" 규칙을 개정해야 하는지가 이 숫자에 걸려 있다.
 *
 * 정의: LCS로 맞춰지지 않은 줄의 비율. `1 - 2·LCS / (원본 줄 수 + 출력 줄 수)`.
 * 이 식이라야 아래 세 기준이 **정확히** 떨어진다.
 */
describe("roundtripDiffRatio — 변경 줄 비율", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

  it("동일한 문자열은 0", () => {
    expect(roundtripDiffRatio(lines(10), lines(10))).toBe(0);
    expect(roundtripDiffRatio("", "")).toBe(0);
  });

  it("한 줄만 바뀌면 1/전체줄수", () => {
    const before = lines(20);
    const after = before.replace("line 7", "line 7 CHANGED");
    expect(roundtripDiffRatio(before, after)).toBeCloseTo(1 / 20, 10);
  });

  it("전체가 재정렬되면 0.9 이상 — 첫 pull PR이 파일 통째로 뜨는 경우다", () => {
    const before = lines(50);
    const after = before.split("\n").reverse().join("\n");
    expect(roundtripDiffRatio(before, after)).toBeGreaterThanOrEqual(0.9);
  });

  it("완전히 다른 내용은 1", () => {
    expect(roundtripDiffRatio("a\nb\nc", "x\ny\nz")).toBe(1);
  });

  it("한쪽이 비면 1 (다른 쪽이 비어 있지 않은 한)", () => {
    expect(roundtripDiffRatio("a\nb", "")).toBe(1);
    expect(roundtripDiffRatio("", "a\nb")).toBe(1);
  });

  it("줄을 추가하기만 해도 센다 (추가 줄 / 전체)", () => {
    // 원본 10줄 + 추가 2줄 → LCS 10, 분모 22 → 1 - 20/22
    const before = lines(10);
    const after = `${before}\nextra 1\nextra 2`;
    expect(roundtripDiffRatio(before, after)).toBeCloseTo(1 - 20 / 22, 10);
  });

  it("공통 접두·접미가 길어도 결과가 같다 (트리밍 최적화가 값을 바꾸지 않는다)", () => {
    const head = lines(500);
    const before = `${head}\nMIDDLE\n${head}`;
    const after = `${head}\nMIDDLE CHANGED\n${head}`;
    const total = 1001;
    expect(roundtripDiffRatio(before, after)).toBeCloseTo(1 / total, 10);
  });

  it("끝 개행 차이도 줄 차이로 잡힌다", () => {
    expect(roundtripDiffRatio("a\nb", "a\nb\n")).toBeGreaterThan(0);
  });

  it("중복 줄이 많아도 LCS가 과대 계산되지 않는다", () => {
    // 같은 줄이 반복되는 파일. 원본 6줄 중 4줄이 "x"
    const before = "x\nx\nx\nx\na\nb";
    const after = "x\nx\na\nb";
    // LCS = 4 (x,x,a,b) → 1 - 8/10
    expect(roundtripDiffRatio(before, after)).toBeCloseTo(1 - 8 / 10, 10);
  });

  it("거대 입력에서도 끝난다 (근사 폴백이 걸려도 범위 안이다)", () => {
    const big = Array.from({ length: 12000 }, (_, i) => `k${i}`).join("\n");
    const shuffled = Array.from({ length: 12000 }, (_, i) => `k${(i * 7919) % 12000}`).join("\n");
    const r = roundtripDiffRatio(big, shuffled);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
    // 같은 입력이면 트리밍만으로 0이 나와야 한다 — 폴백이 0을 망치지 않는다
    expect(roundtripDiffRatio(big, big)).toBe(0);
  });
});
