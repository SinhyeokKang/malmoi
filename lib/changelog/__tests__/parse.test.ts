import { describe, expect, it } from "vitest";

import { parseReleases, RELEASES_PAGE_SIZE } from "../parse";
import { V1_0_0, V1_0_1, V1_0_2 } from "./fixtures";

/**
 * GitHub Releases API 응답 → 화면에 설 앱 릴리스 (design "순수 함수"). **앱 태그 `v<x.y.z>`만 선다** — 같은 리포에
 * 액션 태그(`malmoi-i18n-push-vN`)의 릴리스도 올라오지만 별개 축이다(CLAUDE.md "릴리스 & 버전").
 */

const release = (over: Record<string, unknown>) => ({ ...V1_0_0, ...over });

describe("parseReleases", () => {
  it("실제 응답 셋을 published_at 내림차순으로 낸다", () => {
    const parsed = parseReleases([V1_0_0, V1_0_2, V1_0_1]);
    expect(parsed?.releases.map((r) => r.tag)).toEqual(["v1.0.2", "v1.0.1", "v1.0.0"]);
    expect(parsed?.releases[1]).toEqual({ tag: "v1.0.1", publishedAt: "2026-09-27T16:34:14Z", body: V1_0_1.body });
    expect(parsed?.truncated).toBe(false);
  });

  it("draft · prerelease · 앱 태그 꼴이 아닌 태그 · published_at null을 거른다", () => {
    const parsed = parseReleases([
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
    expect(parseReleases([release({ body: null })])?.releases[0]?.body).toBe("");
  });

  it("같은 시각이면 semver 숫자 내림차순이다 — v1.0.10이 v1.0.9보다 앞선다", () => {
    const at = "2026-09-28T00:00:00Z";
    const parsed = parseReleases([
      release({ tag_name: "v1.0.9", published_at: at }),
      release({ tag_name: "v1.0.10", published_at: at }),
      release({ tag_name: "v1.2.0", published_at: at }),
      release({ tag_name: "v1.10.0", published_at: at }),
    ]);
    expect(parsed?.releases.map((r) => r.tag)).toEqual(["v1.10.0", "v1.2.0", "v1.0.10", "v1.0.9"]);
  });

  it("입력 순서와 무관하게 같은 결과다", () => {
    const a = parseReleases([V1_0_0, V1_0_1, V1_0_2]);
    const b = parseReleases([V1_0_2, V1_0_0, V1_0_1]);
    expect(a).toEqual(b);
  });

  it.each([
    ["배열이 아님", { message: "API rate limit exceeded" }],
    ["null", null],
    ["tag_name 형 불일치", [release({ tag_name: 1 })]],
    ["draft 누락", [{ tag_name: "v1.0.0", published_at: "2026-09-27T12:32:05Z", body: "", prerelease: false }]],
  ])("형이 어긋나면 null이다 — %s", (_, json) => {
    expect(parseReleases(json)).toBeNull();
  });

  it("빈 배열은 빈 목록이다 — 실패(null)와 다르다", () => {
    expect(parseReleases([])).toEqual({ releases: [], truncated: false });
  });

  it("거르기 전 원 배열이 한 요청 상한이면 truncated다 — 거른 뒤 99건이어도", () => {
    expect(RELEASES_PAGE_SIZE).toBe(100);
    const full = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? release({ tag_name: "malmoi-i18n-push-v2" }) : release({ tag_name: `v1.0.${i}` }),
    );
    const parsed = parseReleases(full);
    expect(parsed?.releases).toHaveLength(99);
    expect(parsed?.truncated).toBe(true);
  });

  it("99건이면 truncated가 아니다", () => {
    const some = Array.from({ length: 99 }, (_, i) => release({ tag_name: `v1.0.${i}` }));
    expect(parseReleases(some)?.truncated).toBe(false);
  });
});
