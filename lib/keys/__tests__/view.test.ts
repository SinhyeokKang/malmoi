import { describe, expect, it } from "vitest";
import { buildPermalink, namespaceCounts, translationState, type KeyRow } from "../view";

const row = (over: Partial<KeyRow> & Pick<KeyRow, "key">): KeyRow => ({
  id: `id-${over.key}`,
  namespace: over.key.split(/[._]/)[0] ?? "_root",
  sourceText: "src",
  orphaned: false,
  value: null,
  needsReview: false,
  updatedBy: null,
  refs: [],
  ...over,
});

describe("namespaceCounts — 사이드바", () => {
  it("네임스페이스별 개수를 센다", () => {
    const counts = namespaceCounts([
      row({ key: "common.ok" }),
      row({ key: "common.cancel" }),
      row({ key: "auth.login" }),
    ]);
    expect(counts).toEqual([
      { namespace: "auth", total: 1, untranslated: 1, needsReview: 0, orphaned: 0 },
      { namespace: "common", total: 2, untranslated: 2, needsReview: 0, orphaned: 0 },
    ]);
  });

  it("네임스페이스가 정렬되어 나온다", () => {
    const counts = namespaceCounts([row({ key: "z.a" }), row({ key: "a.b" }), row({ key: "m.c" })]);
    expect(counts.map((c) => c.namespace)).toEqual(["a", "m", "z"]);
  });

  it("상태별 개수를 함께 센다", () => {
    const counts = namespaceCounts([
      row({ key: "a.done", value: "값" }),
      row({ key: "a.stale", value: "값", needsReview: true }),
      row({ key: "a.gone", value: "값", orphaned: true }),
      row({ key: "a.empty" }),
    ]);
    expect(counts[0]).toEqual({
      namespace: "a",
      total: 4,
      untranslated: 1,
      needsReview: 1,
      orphaned: 1,
    });
  });

  it("키가 0개면 빈 목록", () => {
    expect(namespaceCounts([])).toEqual([]);
  });
});

describe("translationState — 배지 판정", () => {
  it("값이 없으면 untranslated", () => {
    expect(translationState(row({ key: "a.b" }))).toBe("untranslated");
  });

  it("빈 문자열도 untranslated다 (편집 UI에서 지운 값이 그렇게 온다)", () => {
    expect(translationState(row({ key: "a.b", value: "" }))).toBe("untranslated");
  });

  it("값이 있으면 translated", () => {
    expect(translationState(row({ key: "a.b", value: "값" }))).toBe("translated");
  });

  it("needsReview가 translated를 이긴다", () => {
    expect(translationState(row({ key: "a.b", value: "값", needsReview: true }))).toBe("needsReview");
  });

  it("orphaned가 전부를 이긴다 — 키 자체가 코드에서 사라졌다", () => {
    expect(translationState(row({ key: "a.b", value: "값", needsReview: true, orphaned: true }))).toBe("orphaned");
    expect(translationState(row({ key: "a.b", orphaned: true }))).toBe("orphaned");
  });

  it("needsReview인데 값이 없으면 untranslated다 — 검토할 값이 없다", () => {
    expect(translationState(row({ key: "a.b", needsReview: true }))).toBe("untranslated");
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
