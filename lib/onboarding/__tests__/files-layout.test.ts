import { describe, expect, it } from "vitest";

import {
  FILES_CANDIDATES_PX,
  FILES_HANDLE_PX,
  FILES_SAMPLE_MIN_PX,
  FILES_SPLIT_MIN_PX,
  candidatesPx,
  filesLayout,
} from "@/lib/onboarding/files-layout";

/** 두 판의 % 몫을 px로 되돌린다 — 지키는 것은 %가 아니라 px다. */
function px(layout: ReturnType<typeof filesLayout>) {
  if (layout === null || layout.mode !== "split") throw new Error("split expected");
  const [left, right] = layout.layout;
  return { candidates: (left * layout.available) / 100, sample: (right * layout.available) / 100 };
}

describe("files-layout — 순차 판/두 판 경계 (responsive-app A1·A5)", () => {
  it("경계는 후보 하한 200 + 핸들 8 + 샘플 최소 400 = 608이다", () => {
    expect(FILES_CANDIDATES_PX).toEqual({ min: 200, default: 240, max: 320 });
    expect(FILES_HANDLE_PX).toBe(8);
    expect(FILES_SAMPLE_MIN_PX).toBe(400);
    expect(FILES_SPLIT_MIN_PX).toBe(608);
  });

  it("bodyWidth 607은 순차 판이다", () => {
    expect(filesLayout(607)).toEqual({ mode: "sequential" });
  });

  it("375 시트 본문(343)도 순차 판이다", () => {
    expect(filesLayout(343)).toEqual({ mode: "sequential" });
  });

  it("bodyWidth 608은 두 판 — available 600, 후보 200 · 샘플 400", () => {
    const layout = filesLayout(608);
    expect(layout).toMatchObject({ mode: "split", available: 600, candidatesWidth: 200 });
    const sizes = px(layout);
    expect(sizes.candidates).toBeCloseTo(200, 6);
    expect(sizes.sample).toBeCloseTo(400, 6);
  });

  it("bodyWidth 609는 두 판 — available 601, 후보 201 · 샘플 400", () => {
    const layout = filesLayout(609);
    expect(layout).toMatchObject({ mode: "split", available: 601, candidatesWidth: 201 });
    const sizes = px(layout);
    expect(sizes.candidates).toBeCloseTo(201, 6);
    expect(sizes.sample).toBeCloseTo(400, 6);
  });

  it("데스크톱 모달 본문(960)은 기본 240이고 상한 320이다", () => {
    const layout = filesLayout(960);
    if (layout?.mode !== "split") throw new Error("split expected");
    expect(layout.available).toBe(952);
    expect(layout.candidatesWidth).toBe(240);
    expect((layout.constraints.minSize * 952) / 100).toBeCloseTo(200, 6);
    expect((layout.constraints.defaultSize * 952) / 100).toBeCloseTo(240, 6);
    expect((layout.constraints.maxSize * 952) / 100).toBeCloseTo(320, 6);
  });

  it("상한은 샘플 400을 남기는 쪽으로 내려간다 — 상한 320보다 좁으면 available − 400", () => {
    const layout = filesLayout(708);
    if (layout?.mode !== "split") throw new Error("split expected");
    expect((layout.constraints.maxSize * 700) / 100).toBeCloseTo(300, 6);
  });

  it("사용자가 고른 폭은 [200, min(320, available − 400)]으로 clamp한다", () => {
    expect(candidatesPx(100, 952)).toBe(200);
    expect(candidatesPx(280, 952)).toBe(280);
    expect(candidatesPx(500, 952)).toBe(320);
    expect(candidatesPx(320, 700)).toBe(300);
    expect(candidatesPx(320, 600)).toBe(200);
    expect(filesLayout(1000, 300)).toMatchObject({ mode: "split", candidatesWidth: 300 });
    expect(filesLayout(708, 320)).toMatchObject({ mode: "split", candidatesWidth: 300 });
  });

  it("못 잰 폭은 null이다 — 0·음수·NaN·Infinity", () => {
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(filesLayout(width)).toBeNull();
    }
  });

  it("고른 폭이 비정상이면 기본 240으로 돌아간다", () => {
    expect(filesLayout(960, Number.NaN)).toMatchObject({ candidatesWidth: 240 });
  });
});
