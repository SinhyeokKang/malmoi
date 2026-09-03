import { describe, expect, it } from "vitest";
import { changedHunks } from "../diff";

/**
 * `changedHunks` — **diff 비율이 못 보는 것을 본다** (spec §왜 diff 비율 하나로는 부족한가).
 *
 * 중첩 JSON 1002줄에서 하위 층만 재정렬되고 값 편집이 3건이면 `diffRatio`는 0.083(목표 통과)인데
 * hunk가 41개다 — 리뷰어는 3건을 찾으려고 41번 스크롤한다. 비율은 "얼마나 바뀌었나"를 재고
 * hunk 수는 **"몇 군데로 흩어졌나"** 를 잰다.
 *
 * ⚠️ `git diff`를 부르지 않는다. 리포 수백 개 × 파일 수천 개를 재는데 프로세스를 띄우면 측정이
 * I/O에 잡아먹히고, 무엇보다 **순수 함수라야 픽스처로 검증된다** (`roundtripDiffRatio`와 같은 축).
 */

describe("changedHunks — 변경이 몇 군데로 흩어졌나", () => {
  it("같으면 0이다", () => {
    expect(changedHunks("a\nb\nc\n", "a\nb\nc\n")).toBe(0);
  });

  it("한 줄만 바뀌면 1이다", () => {
    expect(changedHunks("a\nb\nc\n", "a\nX\nc\n")).toBe(1);
  });

  it("붙어 있는 두 줄은 한 덩어리다", () => {
    expect(changedHunks("a\nb\nc\nd\n", "a\nX\nY\nd\n")).toBe(1);
  });

  it("떨어진 두 곳은 둘이다 — 이 구분이 이 지표의 존재 이유다", () => {
    expect(changedHunks("a\nb\nc\nd\ne\n", "X\nb\nc\nd\nY\n")).toBe(2);
  });

  it("삽입만 있어도 센다", () => {
    expect(changedHunks("a\nc\n", "a\nb\nc\n")).toBe(1);
  });

  it("삭제만 있어도 센다", () => {
    expect(changedHunks("a\nb\nc\n", "a\nc\n")).toBe(1);
  });

  it("전면 재정렬은 비율이 낮아도 hunk가 많다", () => {
    // 이게 diff 비율 하나로는 부족한 이유다. 구조 줄이 반복되면 LCS가 그걸 서로 매칭해
    // 비율은 낮게 나오는데, 실제로 사람이 열어야 하는 곳은 흩어진 채로 남는다.
    const a = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    const b = ["2", "1", "4", "3", "6", "5", "8", "7"].join("\n");
    expect(changedHunks(a, b)).toBeGreaterThan(1);
  });

  it("빈 문자열끼리는 0이다", () => {
    expect(changedHunks("", "")).toBe(0);
  });

  it("한쪽이 비면 한 덩어리다", () => {
    expect(changedHunks("a\nb\n", "")).toBe(1);
  });

  it("대칭이 아니어도 된다 — 세는 것은 '몇 군데'이지 방향이 아니다", () => {
    expect(changedHunks("a\nb\nc\n", "a\nc\n")).toBe(changedHunks("a\nc\n", "a\nb\nc\n"));
  });
});
