import { describe, expect, it } from "vitest";
import { localeProgress, type LocaleProgress } from "@/lib/keys/view";
import { meterValue, sourceRowMeters } from "../meters";

const row = (overrides: Partial<LocaleProgress> = {}): LocaleProgress => ({
  code: "ko", isBase: false, orphaned: false, total: 100,
  translated: 84, needsReview: 8, untranslated: 8, percent: 92, ...overrides,
});

describe("meterValue", () => {
  it("완료·검토 폭과 생산자의 퍼센트를 그대로 옮긴다", () => {
    expect(meterValue(row())).toEqual({ code: "ko", total: 100, done: 84, review: 8, percent: 92 });
  });
  it("완료 수가 분모를 넘으면 폭을 분모로 제한한다", () => {
    expect(meterValue(row({ total: 10, translated: 12, needsReview: 3, percent: 100 })))
      .toEqual({ code: "ko", total: 10, done: 10, review: 0, percent: 100 });
  });
  it("검토 폭은 완료 뒤 남은 칸을 넘지 않는다", () => {
    expect(meterValue(row({ total: 10, translated: 8, needsReview: 5, percent: 100 })))
      .toEqual({ code: "ko", total: 10, done: 8, review: 2, percent: 100 });
  });
  it("분모가 0이면 두 폭도 0이다", () => {
    expect(meterValue(row({ total: 0, percent: 0 }))).toEqual({ code: "ko", total: 0, done: 0, review: 0, percent: 0 });
  });
});

describe("sourceRowMeters", () => {
  it.each([0, 1, 5, 6, 59])("언어 %i개의 앞 5개와 남은 수만 싣는다", count => {
    const languages = Array.from({ length: count }, (_, i) => row({ code: `l${i}` }));
    expect(sourceRowMeters(languages)).toEqual({ shown: languages.slice(0, 5).map(meterValue), hidden: Math.max(0, count - 5) });
  });
  it("고아를 제외하고 base부터 코드순으로 나온 생산자의 순서를 보존한다", () => {
    const languages = localeProgress({
      locales: [
        { code: "aa", isBase: false, orphaned: true },
        { code: "ko", isBase: true, orphaned: false },
        { code: "fr", isBase: false, orphaned: false },
        { code: "en", isBase: false, orphaned: false },
      ], total: 1, cells: [],
    });
    expect(sourceRowMeters(languages).shown.map(value => value.code)).toEqual(["ko", "en", "fr"]);
    expect(sourceRowMeters([row({ orphaned: true })])).toEqual({ shown: [], hidden: 0 });
  });
  it("고아는 표시 상한과 남은 수에 포함하지 않는다", () => {
    const languages = [row({ orphaned: true }), ...Array.from({ length: 6 }, (_, i) => row({ code: `l${i}` }))];
    expect(sourceRowMeters(languages)).toEqual({ shown: languages.slice(1, 6).map(meterValue), hidden: 1 });
  });
  it("키가 0이면 언어가 6개여도 막대와 남은 수가 없다", () => {
    expect(sourceRowMeters(Array.from({ length: 6 }, () => row({ total: 0 })))).toEqual({ shown: [], hidden: 0 });
  });
});
