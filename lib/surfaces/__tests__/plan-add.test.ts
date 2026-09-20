import { expect, it } from "vitest";
import { planAddSources, summarizeAddResults, formatSourceCounts } from "../plan-add";
import type { CandidateSummary } from "@/lib/onboarding/detect";
const candidate = (pathTemplate: string): CandidateSummary => ({ adapter: "json-catalog", label: "JSON", pathTemplate, outputPaths: [], locales: ["en"], baseLocale: "en", keys: { status: "counted", count: 1 }, samples: [] });
it("이미 쓰는 템플릿은 잠그고 새 후보의 순서와 내용을 지킨다", () => {
  const a = candidate("a/{locale}.json"), b = candidate("b/{locale}.json");
  expect(planAddSources({ picked: [a, b], existing: [{ pathTemplate: a.pathTemplate }] })).toEqual({ ok: true, add: [b], locked: [a] });
  expect(planAddSources({ picked: [], existing: [] })).toEqual({ ok: true, add: [], locked: [] });
});
it("선택 내 같은 템플릿은 어댑터나 잠금과 무관하게 거부한다", () => {
  const a = candidate("a/{locale}.json");
  expect(planAddSources({ picked: [a, { ...a, adapter: "code-dict" }], existing: [] })).toEqual({ ok: false, error: "duplicate-path-template" });
});
it("적재 부분 실패는 파일 오류 배열 대신 failed 합으로 경고한다", () => {
  expect(summarizeAddResults([])).toEqual({ surfaces: 0, keys: 0, failed: 0, tone: "success" });
  const good = { pathTemplate: "a", surfaceSlug: "a", count: 5, failed: 0 };
  expect(summarizeAddResults([good])).toEqual({ surfaces: 1, keys: 5, failed: 0, tone: "success" });
  const duplicateFailure = { ...good, count: 2, failed: 3, errors: [] };
  expect(summarizeAddResults([good, duplicateFailure])).toEqual({ surfaces: 2, keys: 7, failed: 3, tone: "warning" });
});
it("서버가 orphaned를 제외해 센 수를 표시한다", () => {
  expect(formatSourceCounts({ keys: 0, locales: 0 })).toBe("0 keys · 0 languages");
  expect(formatSourceCounts({ keys: 1, locales: 1 })).toBe("1 key · 1 language");
  expect(formatSourceCounts({ keys: 2000, locales: 2 })).toBe("2,000 keys · 2 languages");
});
