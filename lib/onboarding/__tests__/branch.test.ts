import { describe, expect, it } from "vitest";

import { isValidBranchName } from "@/lib/pull/branch-name";

import { planBranchChoice } from "../branch";

/**
 * ①의 브랜치 칸이 무엇으로 서는지를 정하는 순수 함수 (feature design §3.2·§4).
 *
 * ⚠️ **실패한 조회를 "브랜치가 없다"로 읽지 않는다** (POSTMORTEM 2026-09-03). 조회가 실패하면
 * 빈 `Select`가 아니라 **읽기 전용 default branch**이고, 그 사실을 캡션이 말한다.
 */
describe("planBranchChoice — 브랜치 칸의 갈래와 기본 선택", () => {
  it("목록이 있으면 `Select`이고 기본 선택이 default branch다", () => {
    const c = planBranchChoice({ names: ["develop", "main", "release/2.0"], defaultBranch: "main" });

    expect(c.mode).toBe("select");
    expect(c.selected).toBe("main");
  });

  it("default branch가 목록 맨 앞에 선다 — 300개 중에서 기본값을 찾아 스크롤하게 두지 않는다", () => {
    const c = planBranchChoice({ names: ["develop", "main", "release/2.0"], defaultBranch: "main" });

    expect(c.mode === "select" && c.names).toEqual(["main", "develop", "release/2.0"]);
  });

  it("나머지 순서는 GitHub이 준 그대로다 — 우리가 다시 정렬하지 않는다", () => {
    const c = planBranchChoice({ names: ["zeta", "alpha", "main"], defaultBranch: "main" });

    expect(c.mode === "select" && c.names).toEqual(["main", "zeta", "alpha"]);
  });

  it("목록에 default branch가 없어도 선택지에 넣는다 — 고를 수 없는 값을 기본값으로 두지 않는다", () => {
    const c = planBranchChoice({ names: ["develop"], defaultBranch: "main" });

    expect(c.mode === "select" && c.names).toEqual(["main", "develop"]);
    expect(c.selected).toBe("main");
  });

  it("같은 이름이 두 번 와도 한 번만 낸다", () => {
    const c = planBranchChoice({ names: ["main", "main", "develop"], defaultBranch: "main" });

    expect(c.mode === "select" && c.names).toEqual(["main", "develop"]);
  });

  it("300개에서 끊겼으면 자유 입력이다 — 없는 브랜치를 '없다'고 말하지 않는다", () => {
    const c = planBranchChoice({ names: ["main"], defaultBranch: "main", truncated: true });

    expect(c.mode).toBe("input");
    expect(c.selected).toBe("main");
  });

  it("목록 조회가 실패하면 읽기 전용 default branch 하나다 — ①을 막지 않는다 (예외 D)", () => {
    const c = planBranchChoice({ names: undefined, defaultBranch: "develop" });

    expect(c.mode).toBe("fixed");
    expect(c.selected).toBe("develop");
  });

  it("조회는 성공했는데 브랜치가 0개여도 default branch는 고를 수 있다", () => {
    const c = planBranchChoice({ names: [], defaultBranch: "main" });

    expect(c.mode === "select" && c.names).toEqual(["main"]);
  });

  it("`/`가 든 이름을 그대로 나른다 — 인코딩·치환을 여기서 하지 않는다 (POSTMORTEM 2026-09-01)", () => {
    const c = planBranchChoice({ names: ["release/2.0"], defaultBranch: "release/2.0" });

    expect(c.selected).toBe("release/2.0");
    expect(isValidBranchName(c.selected)).toBe(true);
  });
});
