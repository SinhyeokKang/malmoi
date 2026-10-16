import { describe, expect, it } from "vitest";

import { mergeReleasePages, parseReleasePage, RELEASES_PAGE_SIZE } from "../parse";
import { V1_0_0, V1_0_1, V1_0_2 } from "./fixtures";

/**
 * GitHub Releases API 응답 → 화면에 설 앱 릴리스 (design "순수 함수"). **앱 태그 `v<x.y.z>`만 선다** — 같은 리포에
 * 액션 태그(`malmoi-i18n-push-vN`)의 릴리스도 올라오지만 별개 축이다(CLAUDE.md "릴리스 & 버전").
 * 한 페이지 파싱(`parseReleasePage`)과 여러 페이지 합치기·정렬(`mergeReleasePages`)이 갈려 있다 — 정렬은 합친 뒤 한 번이다.
 */

const release = (over: Record<string, unknown>) => ({ ...V1_0_0, ...over });
const entry = (tag: string, publishedAt = "2026-09-28T00:00:00Z") => ({ tag, publishedAt, body: "" });

describe("parseReleasePage", () => {
  it("실제 응답 셋을 거르기만 하고 응답 순서를 지킨다 — 정렬은 합치는 쪽이다", () => {
    const parsed = parseReleasePage([V1_0_0, V1_0_2, V1_0_1]);
    expect(parsed?.releases.map((r) => r.tag)).toEqual(["v1.0.0", "v1.0.2", "v1.0.1"]);
    expect(parsed?.releases[2]).toEqual({ tag: "v1.0.1", publishedAt: "2026-09-27T16:34:14Z", body: V1_0_1.body });
    expect(parsed?.full).toBe(false);
  });

  it("draft · prerelease · 앱 태그 꼴이 아닌 태그 · published_at null을 거른다", () => {
    const parsed = parseReleasePage([
      V1_0_1,
      release({ tag_name: "v1.1.0", draft: true }),
      release({ tag_name: "v1.2.0", prerelease: true }),
      release({ tag_name: "malmoi-i18n-push-v2" }),
      release({ tag_name: "v1.0.0-rc.1" }),
      release({ tag_name: "1.0.0" }),
      release({ tag_name: "v2.0.0", published_at: null }),
    ]);
    expect(parsed?.releases.map((r) => r.tag)).toEqual(["v1.0.1"]);
  });

  it("body null은 빈 문자열이다", () => {
    expect(parseReleasePage([release({ body: null })])?.releases[0]?.body).toBe("");
  });

  it.each([
    ["배열이 아님", { message: "API rate limit exceeded" }],
    ["null", null],
    ["tag_name 형 불일치", [release({ tag_name: 1 })]],
    ["draft 누락", [{ tag_name: "v1.0.0", published_at: "2026-09-27T12:32:05Z", body: "", prerelease: false }]],
  ])("형이 어긋나면 null이다 — %s", (_, json) => {
    expect(parseReleasePage(json)).toBeNull();
  });

  it("빈 배열은 빈 페이지다 — 실패(null)와 다르다", () => {
    expect(parseReleasePage([])).toEqual({ releases: [], full: false });
  });

  it("거르기 전 원 배열이 한 요청 상한이면 full이다 — 거른 뒤 99건이어도", () => {
    expect(RELEASES_PAGE_SIZE).toBe(100);
    const page = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? release({ tag_name: "malmoi-i18n-push-v2" }) : release({ tag_name: `v1.0.${i}` }),
    );
    const parsed = parseReleasePage(page);
    expect(parsed?.releases).toHaveLength(99);
    expect(parsed?.full).toBe(true);
  });

  it("거른 뒤 0건이어도 원 배열이 100칸이면 full이다 — 액션 태그 릴리스만 찬 페이지 뒤에 앱 태그가 있을 수 있다", () => {
    const page = Array.from({ length: 100 }, (_, i) => release({ tag_name: `malmoi-i18n-push-v${i}` }));
    expect(parseReleasePage(page)).toEqual({ releases: [], full: true });
  });

  it("99건이면 full이 아니다", () => {
    const some = Array.from({ length: 99 }, (_, i) => release({ tag_name: `v1.0.${i}` }));
    expect(parseReleasePage(some)?.full).toBe(false);
  });
});

describe("mergeReleasePages", () => {
  it("published_at 내림차순으로 낸다", () => {
    const merged = mergeReleasePages([[entry("v1.0.0", "2026-09-27T12:32:05Z"), entry("v1.0.2", "2026-09-28T01:00:20Z")]]);
    expect(merged.map((r) => r.tag)).toEqual(["v1.0.2", "v1.0.0"]);
  });

  it("같은 시각이면 semver 숫자 내림차순이다 — v1.0.10이 v1.0.9보다 앞선다", () => {
    const merged = mergeReleasePages([
      [entry("v1.0.9"), entry("v1.0.10")],
      [entry("v1.2.0"), entry("v1.10.0")],
    ]);
    expect(merged.map((r) => r.tag)).toEqual(["v1.10.0", "v1.2.0", "v1.0.10", "v1.0.9"]);
  });

  it("합친 뒤 한 번 정렬한다 — 페이지 2의 항목이 페이지 1보다 최신이어도 앞에 선다", () => {
    const merged = mergeReleasePages([
      [entry("v1.0.1", "2026-09-27T16:34:14Z")],
      [entry("v1.0.2", "2026-09-28T01:00:20Z")],
    ]);
    expect(merged.map((r) => r.tag)).toEqual(["v1.0.2", "v1.0.1"]);
  });

  it("페이지 경계에서 겹친 태그는 한 번만 남기고 먼저 나온 것을 남긴다", () => {
    const first = { ...entry("v1.0.1", "2026-09-27T16:34:14Z"), body: "first" };
    const second = { ...entry("v1.0.1", "2026-09-27T16:34:14Z"), body: "second" };
    const merged = mergeReleasePages([[entry("v1.0.2", "2026-09-28T01:00:20Z"), first], [second, entry("v1.0.0", "2026-09-27T12:32:05Z")]]);
    expect(merged.map((r) => r.tag)).toEqual(["v1.0.2", "v1.0.1", "v1.0.0"]);
    expect(merged[1]?.body).toBe("first");
  });

  it("같은 100건이 두 페이지에 반복돼도 한 벌이다", () => {
    const page = Array.from({ length: 100 }, (_, i) => entry(`v1.0.${i}`, `2026-09-28T00:00:${String(i % 60).padStart(2, "0")}Z`));
    const merged = mergeReleasePages([page, page]);
    expect(merged).toHaveLength(100);
    expect(new Set(merged.map((r) => r.tag)).size).toBe(100);
  });

  it("입력 페이지 순서와 무관하게 같은 결과다", () => {
    const a = [entry("v1.0.0", "2026-09-27T12:32:05Z"), entry("v1.0.1", "2026-09-27T16:34:14Z")];
    const b = [entry("v1.0.2", "2026-09-28T01:00:20Z")];
    expect(mergeReleasePages([a, b])).toEqual(mergeReleasePages([b, a]));
  });

  it("빈 입력은 []이다", () => {
    expect(mergeReleasePages([])).toEqual([]);
    expect(mergeReleasePages([[], []])).toEqual([]);
  });
});
