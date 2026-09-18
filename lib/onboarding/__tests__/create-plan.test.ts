import { describe, expect, it } from "vitest";

import type { RepoConnect } from "@/lib/github-connect/connect-plan";

import { planProjectCreate } from "../create-plan";

/**
 * 프로젝트 생성 가부가 값으로 판정되는 한 자리 (ARCHITECTURE §3.1). 3중 검증(`planRepoConnect`)의 결과를 받아
 * **그대로 흘리고**, 그 위에 OWNER 개수 제한과 slug 충돌을 얹는다.
 *
 * ⚠️ **`unavailable`은 `unavailable`로 그대로 나간다.** 조회 실패를 거부로 접으면 사용자가 있는 권한을
 * 없다고 믿는다 (POSTMORTEM 2026-09-03).
 */

const OK: RepoConnect = { status: "ok", installationId: "42", repoOwner: "acme", repoName: "web" };
const base = { repoConnect: OK, ownerCount: 0, slugTaken: false, limit: 3 };

describe("planProjectCreate — 3중 검증 결과가 그대로 흘러나온다", () => {
  it.each(["repo-not-installed", "installation-forbidden", "repo-forbidden"] as const)("%s", (status) => {
    expect(planProjectCreate({ ...base, repoConnect: { status } })).toEqual({ status });
  });

  it("`unavailable`은 거부 갈래로 접지 않는다 — 제한·충돌이 동시에 있어도 장애가 먼저다", () => {
    expect(
      planProjectCreate({ ...base, repoConnect: { status: "unavailable" }, ownerCount: 3, slugTaken: true }),
    ).toEqual({ status: "unavailable" });
  });

  it("연결 거부는 제한·충돌보다 앞이다 — 거부될 요청에 다른 사유를 덧붙이지 않는다", () => {
    expect(
      planProjectCreate({ ...base, repoConnect: { status: "repo-forbidden" }, ownerCount: 3, slugTaken: true }),
    ).toEqual({ status: "repo-forbidden" });
  });
});

describe("planProjectCreate — OWNER 개수 제한 (PRODUCT §4.2: 자율 가입의 대가)", () => {
  it("OWNER 행이 limit개면 `limit-reached`다", () => {
    expect(planProjectCreate({ ...base, ownerCount: 3 })).toEqual({ status: "limit-reached" });
  });

  it("limit 미만이면 통과한다 — 분자는 호출부가 OWNER 행만 센 값이다(EDITOR 멤버십은 세지 않는다)", () => {
    expect(planProjectCreate({ ...base, ownerCount: 2 }).status).toBe("ok");
  });

  it("제한이 slug 충돌보다 앞이다 — 슬롯이 없으면 slug를 바꿔도 소용없다", () => {
    expect(planProjectCreate({ ...base, ownerCount: 3, slugTaken: true })).toEqual({ status: "limit-reached" });
  });
});

describe("planProjectCreate — slug 충돌", () => {
  it("이미 있는 slug면 `slug-taken`이다", () => {
    expect(planProjectCreate({ ...base, slugTaken: true })).toEqual({ status: "slug-taken" });
  });
});

describe("planProjectCreate — 통과", () => {
  it("installationId·repoOwner·repoName은 **probe가 준 값**이다 — 클라이언트 입력이 아니다 (ARCHITECTURE §6.00 ③)", () => {
    expect(planProjectCreate(base)).toEqual({
      status: "ok",
      installationId: "42",
      repoOwner: "acme",
      repoName: "web",
    });
  });
});
