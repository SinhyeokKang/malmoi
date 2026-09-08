import { describe, expect, it } from "vitest";
import { buildCommitPayload, buildTreePayload, SKIP_MARKER } from "../payload";

describe("buildTreePayload — base_tree 누락이 리포 전체를 지운다", () => {
  const changes = [
    { path: "i18n/en.json", content: '{\n  "a": "hi"\n}\n' },
    { path: "i18n/ko.json", content: '{\n  "a": "안녕"\n}\n' },
  ];

  it("base_tree를 반드시 싣는다 — 빠지면 리포의 나머지 파일이 전부 삭제된 커밋이 된다", () => {
    expect(buildTreePayload(changes, "basetree-sha").base_tree).toBe("basetree-sha");
  });

  it("변경분마다 mode 100644 / type blob으로 항목을 만든다", () => {
    const payload = buildTreePayload(changes, "basetree-sha");
    expect(payload.tree).toEqual([
      { path: "i18n/en.json", mode: "100644", type: "blob", content: changes[0]!.content },
      { path: "i18n/ko.json", mode: "100644", type: "blob", content: changes[1]!.content },
    ]);
  });

  it("변경분 순서를 그대로 지킨다 — planPullChanges가 이미 정렬했다", () => {
    const payload = buildTreePayload(changes, "x");
    expect(payload.tree.map((t) => t.path)).toEqual(["i18n/en.json", "i18n/ko.json"]);
  });

  it("변경분이 0개면 던진다 — 낼 것이 없는데 트리를 만들면 base와 같은 빈 커밋이 나간다", () => {
    expect(() => buildTreePayload([], "basetree-sha")).toThrow(/no changes/);
  });

  it("base_tree가 빈 문자열이면 던진다 — 누락과 구별되지 않는 값이다", () => {
    expect(() => buildTreePayload(changes, "")).toThrow(/base_tree/);
  });

  it("같은 입력 두 번 → 같은 페이로드 (결정성)", () => {
    expect(buildTreePayload(changes, "x")).toEqual(buildTreePayload(changes, "x"));
  });
});

describe("buildCommitPayload — parents가 항상 base head다", () => {
  it("parents가 base head 하나뿐이다 — l10n/sync의 기존 head를 쓰면 3-way merge가 필요해진다", () => {
    expect(buildCommitPayload("tree-sha", "basehead-sha", "3 files").parents).toEqual([
      "basehead-sha",
    ]);
  });

  it("tree를 싣는다", () => {
    expect(buildCommitPayload("tree-sha", "basehead-sha", "3 files").tree).toBe("tree-sha");
  });

  it("메시지에 [skip-l10n]이 들어간다 — 없으면 머지된 커밋이 push를 다시 돌려 무한 루프다", () => {
    expect(buildCommitPayload("t", "b", "3 files").message).toContain(SKIP_MARKER);
  });

  it("메시지에 요약이 들어간다 — 사람이 PR 목록에서 무엇이 바뀌었는지 본다", () => {
    expect(buildCommitPayload("t", "b", "3 files").message).toContain("3 files");
  });

  it("빈 요약이어도 마커는 유지된다", () => {
    expect(buildCommitPayload("t", "b", "").message).toContain(SKIP_MARKER);
  });

  it("treeSha가 비면 던진다", () => {
    expect(() => buildCommitPayload("", "b", "x")).toThrow(/tree/);
  });

  it("parentSha가 비면 던진다 — parents 없는 커밋은 리포의 루트 커밋이 된다", () => {
    expect(() => buildCommitPayload("t", "", "x")).toThrow(/parent/);
  });

  it("같은 입력 두 번 → 같은 페이로드 (결정성 — 타임스탬프를 넣지 않는다)", () => {
    expect(buildCommitPayload("t", "b", "x")).toEqual(buildCommitPayload("t", "b", "x"));
  });
});
