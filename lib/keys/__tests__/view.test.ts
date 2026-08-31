import { describe, expect, it } from "vitest";
import { buildPermalink, namespaceCounts, translationState, type KeyRow } from "../view";

const row = (over: Partial<KeyRow> & Pick<KeyRow, "key">): KeyRow => ({
  id: `id-${over.key}`,
  namespace: over.key.split(/[._]/)[0] ?? "_root",
  sourceText: "src",
  orphaned: false,
  /** 로케일 코드 → 값. 테이블이 로케일을 열로 펼치므로 행이 전부 들고 있어야 한다. */
  cells: {},
  refs: [],
  ...over,
});

/** 단일 로케일 관점 헬퍼 — 배지 판정 테스트는 셀 하나만 본다. */
const cell = (over: Partial<KeyRow["cells"][string]> = {}) => ({
  value: null, needsReview: false, updatedBy: null, ...over,
});

describe("namespaceCounts — 사이드바", () => {
  // 테이블이 로케일을 열로 펼치므로 "일이 얼마나 남았나"는 로케일마다 다르다.
  // 어느 로케일 기준으로 셀지를 인자로 받는다.
  it("네임스페이스별 개수를 센다", () => {
    const counts = namespaceCounts([
      row({ key: "common.ok" }),
      row({ key: "common.cancel" }),
      row({ key: "auth.login" }),
    ], "ko");
    expect(counts).toEqual([
      { namespace: "auth", total: 1, untranslated: 1, needsReview: 0, orphaned: 0 },
      { namespace: "common", total: 2, untranslated: 2, needsReview: 0, orphaned: 0 },
    ]);
  });

  it("네임스페이스가 정렬되어 나온다", () => {
    const counts = namespaceCounts([row({ key: "z.a" }), row({ key: "a.b" }), row({ key: "m.c" })], "ko");
    expect(counts.map((c) => c.namespace)).toEqual(["a", "m", "z"]);
  });

  it("상태별 개수를 함께 센다", () => {
    const counts = namespaceCounts([
      row({ key: "a.done", cells: { ko: cell({ value: "값" }) } }),
      row({ key: "a.stale", cells: { ko: cell({ value: "값", needsReview: true }) } }),
      row({ key: "a.gone", cells: { ko: cell({ value: "값" }) }, orphaned: true }),
      row({ key: "a.empty" }),
    ], "ko");
    expect(counts[0]).toEqual({
      namespace: "a",
      total: 4,
      untranslated: 1,
      needsReview: 1,
      orphaned: 1,
    });
  });

  it("키가 0개면 빈 목록", () => {
    expect(namespaceCounts([], "ko")).toEqual([]);
  });
});

describe("translationState — 배지 판정", () => {
  it("값이 없으면 untranslated", () => {
    expect(translationState({ orphaned: false, value: null, needsReview: false })).toBe("untranslated");
  });

  it("빈 문자열도 untranslated다 (편집 UI에서 지운 값이 그렇게 온다)", () => {
    expect(translationState({ orphaned: false, value: "", needsReview: false })).toBe("untranslated");
  });

  it("값이 있으면 translated", () => {
    expect(translationState({ orphaned: false, value: "값", needsReview: false })).toBe("translated");
  });

  it("needsReview가 translated를 이긴다", () => {
    expect(translationState({ orphaned: false, value: "값", needsReview: true })).toBe("needsReview");
  });

  it("orphaned가 전부를 이긴다 — 키 자체가 코드에서 사라졌다", () => {
    expect(translationState({ orphaned: true, value: "값", needsReview: true })).toBe("orphaned");
    expect(translationState({ orphaned: true, value: null, needsReview: false })).toBe("orphaned");
  });

  it("needsReview인데 값이 없으면 untranslated다 — 검토할 값이 없다", () => {
    expect(translationState({ orphaned: false, value: null, needsReview: true })).toBe("untranslated");
  });
});

describe("namespaceCounts — 로케일마다 남은 일이 다르다", () => {
  const rows = [
    row({ key: "a.x", cells: { ko: cell({ value: "번역됨" }), fr: cell() } }),
    row({ key: "a.y", cells: { ko: cell(), fr: cell({ value: "traduit" }) } }),
  ];

  it("ko 기준", () => {
    expect(namespaceCounts(rows, "ko")[0]).toMatchObject({ total: 2, untranslated: 1 });
  });

  it("fr 기준 — 다른 결과가 나온다", () => {
    expect(namespaceCounts(rows, "fr")[0]).toMatchObject({ total: 2, untranslated: 1 });
  });

  it("셀이 없는 로케일은 전부 미번역이다", () => {
    expect(namespaceCounts(rows, "ja")[0]).toMatchObject({ total: 2, untranslated: 2 });
  });
});

describe("buildPermalink — GitHub 코드 참조", () => {
  const project = { repoOwner: "acme", repoName: "app", lastCommitSha: "a".repeat(40) };

  it("owner/repo/blob/sha/path#Lline 형태다", () => {
    expect(buildPermalink(project, { path: "src/a.ts", line: 42 })).toBe(
      `https://github.com/acme/app/blob/${"a".repeat(40)}/src/a.ts#L42`,
    );
  });

  it("커밋 SHA가 없으면 null — 브랜치명으로 대체하지 않는다", () => {
    // 브랜치로 링크하면 코드가 움직여 줄 번호가 어긋난다. permalink의 요지가 사라진다.
    expect(buildPermalink({ ...project, lastCommitSha: null }, { path: "a.ts", line: 1 })).toBeNull();
  });

  it("경로의 슬래시는 인코딩하지 않는다 (디렉터리 구분자다)", () => {
    const url = buildPermalink(project, { path: "src/deep/nested/file.ts", line: 7 });
    expect(url).toContain("/src/deep/nested/file.ts#L7");
  });

  it("경로의 특수문자는 인코딩한다", () => {
    const url = buildPermalink(project, { path: "src/[locale]/page.tsx", line: 3 });
    expect(url).toContain("%5Blocale%5D");
    expect(url).not.toContain("[locale]");
  });
});
