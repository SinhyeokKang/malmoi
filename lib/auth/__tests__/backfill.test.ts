import { describe, expect, it } from "vitest";

import { planOwnerBackfill, resolveBackfillOptions } from "../backfill";

/**
 * 기존 `Project`에 OWNER를 채우는 일회성 판정 (design §5 배포 순서 2).
 *
 * **멱등성을 여기서 결정한다** — 스크립트를 두 번 돌려 행 수를 세는 수동 확인 대신
 * `pnpm test`가 판정한다. 스크립트는 이 결과를 upsert하는 I/O 껍데기다.
 *
 * ⚠️ 이 판정이 비면 그다음 배포에서 **아무도 아무 프로젝트에도 못 들어간다**(fail-closed라
 * 옳지만 복구가 SQL이다).
 */

describe("planOwnerBackfill — OWNER가 없는 프로젝트만", () => {
  it("멤버가 하나도 없는 프로젝트에 OWNER 행을 낸다", () => {
    expect(
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "u-owner" }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("이미 OWNER가 있는 프로젝트는 건너뛴다 — 소유자를 갈아치우지 않는다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }],
        members: [{ projectId: "p1", role: "OWNER" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([]);
  });

  it("EDITOR만 있는 프로젝트에는 OWNER 행을 낸다 — OWNER 없는 프로젝트는 접근 불가다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }],
        members: [{ projectId: "p1", role: "EDITOR" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("다른 프로젝트의 OWNER는 이 프로젝트를 채워주지 않는다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }, { id: "p2" }],
        members: [{ projectId: "p2", role: "OWNER" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("프로젝트가 없으면 빈 목록이다", () => {
    expect(planOwnerBackfill({ projects: [], members: [], ownerUserId: "u-owner" })).toEqual([]);
  });

  it("입력 순서를 따른다 — 같은 입력이 같은 순서를 낸다", () => {
    const input = {
      projects: [{ id: "b" }, { id: "a" }, { id: "c" }],
      members: [],
      ownerUserId: "u-owner",
    };
    expect(planOwnerBackfill(input).map((r) => r.projectId)).toEqual(["b", "a", "c"]);
    expect(planOwnerBackfill(input)).toEqual(planOwnerBackfill(input));
  });
});

describe("planOwnerBackfill — 소유자 id가 비면 던진다 (fail-closed)", () => {
  // ⚠️ 빈 목록을 내면 스크립트가 그것을 "채울 프로젝트가 없다"로 읽고 **성공을 보고한다** —
  // POSTMORTEM 2026-09-03이 정확히 그 형태였다(실패한 조회를 "없음"으로 읽었다). 그리고 스크립트는
  // `User`까지 upsert하므로 빈 id가 통과하면 **빈 id의 User가 모든 프로젝트의 OWNER가 된다.**
  // `syncBranchFor`(lib/pull/trigger.ts)가 같은 이유로 값 대신 던진다.
  it("빈 문자열이면 던진다", () => {
    expect(() =>
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "" }),
    ).toThrow();
  });

  it("공백만이어도 던진다", () => {
    expect(() =>
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "   " }),
    ).toThrow();
  });

  it("채울 프로젝트가 없어도 던진다 — 빈 결과와 잘못된 입력을 구별한다", () => {
    expect(() => planOwnerBackfill({ projects: [], members: [], ownerUserId: "" })).toThrow();
  });
});

describe("planOwnerBackfill — 멱등", () => {
  it("결과를 멤버 목록에 합쳐 다시 돌리면 0건이다", () => {
    const projects = [{ id: "p1" }, { id: "p2" }];
    const first = planOwnerBackfill({ projects, members: [], ownerUserId: "u-owner" });
    expect(first).toHaveLength(2);

    const applied = first.map((r) => ({ projectId: r.projectId, role: r.role }));
    expect(planOwnerBackfill({ projects, members: applied, ownerUserId: "u-owner" })).toEqual([]);
  });
});

/**
 * ⚠️ **이 판정이 틀리면 프로덕션 DB에 쓴다.** 스크립트가 dev/prod 양쪽을 겨눌 수 있는 유일한
 * 코드라, 대상 결정과 쓰기 여부를 순수 함수로 빼서 테스트가 고정한다. I/O는 껍데기가 한다.
 *
 * **기본이 dev이고 기본이 dry-run이다** — 둘 다 명시해야 위험한 쪽으로 간다.
 */
describe("resolveBackfillOptions — 어느 DB에 쓰는가", () => {
  const owner = ["--owner-email", "a@b.com", "--owner-github-id", "12345"];

  it("플래그가 없으면 dev이고 dry-run이다", () => {
    const o = resolveBackfillOptions(owner);
    expect(o.target).toBe("dev");
    expect(o.envVar).toBe("DIRECT_URL");
    expect(o.apply).toBe(false);
  });

  it("--apply만 주면 dev에 쓴다", () => {
    const o = resolveBackfillOptions([...owner, "--apply"]);
    expect(o.target).toBe("dev");
    expect(o.apply).toBe(true);
  });

  it("--target prod는 DIRECT_URL_PROD를 고른다 — 런타임 URL(DATABASE_URL_PROD)은 존재하지 않는다", () => {
    const o = resolveBackfillOptions([...owner, "--target", "prod"]);
    expect(o.target).toBe("prod");
    expect(o.envVar).toBe("DIRECT_URL_PROD");
  });

  it("--target prod만으로는 쓰지 않는다 — --apply가 따로 필요하다", () => {
    expect(resolveBackfillOptions([...owner, "--target", "prod"]).apply).toBe(false);
    expect(resolveBackfillOptions([...owner, "--target", "prod", "--apply"]).apply).toBe(true);
  });

  it("--target dev를 명시해도 dev다", () => {
    expect(resolveBackfillOptions([...owner, "--target", "dev"]).envVar).toBe("DIRECT_URL");
  });

  it("모르는 --target은 던진다 — 조용히 dev로 떨어뜨리지 않는다", () => {
    expect(() => resolveBackfillOptions([...owner, "--target", "staging"])).toThrow();
    expect(() => resolveBackfillOptions([...owner, "--target", "PROD"])).toThrow();
  });

  it("--target에 값이 없으면 던진다", () => {
    expect(() => resolveBackfillOptions([...owner, "--target"])).toThrow();
  });
});

describe("resolveBackfillOptions — 소유자 인자", () => {
  it("이메일과 GitHub 숫자 id를 받는다", () => {
    const o = resolveBackfillOptions(["--owner-email", "a@b.com", "--owner-github-id", "12345"]);
    expect(o.owner).toEqual({ email: "a@b.com", githubId: "12345", name: undefined });
  });

  it("이메일을 정규화한다 — User.email과 같은 규칙이어야 대조가 갈리지 않는다", () => {
    const o = resolveBackfillOptions(["--owner-email", " A@B.com ", "--owner-github-id", "1"]);
    expect(o.owner.email).toBe("a@b.com");
  });

  it("--owner-name은 선택이다", () => {
    const o = resolveBackfillOptions([
      "--owner-email", "a@b.com", "--owner-github-id", "1", "--owner-name", "Sinhyeok",
    ]);
    expect(o.owner.name).toBe("Sinhyeok");
  });

  it("이메일이 없으면 던진다 — 빈 값으로 User를 만들면 되돌릴 수 없다", () => {
    expect(() => resolveBackfillOptions(["--owner-github-id", "1"])).toThrow();
    expect(() => resolveBackfillOptions(["--owner-email", "", "--owner-github-id", "1"])).toThrow();
    expect(() => resolveBackfillOptions(["--owner-email", "   ", "--owner-github-id", "1"])).toThrow();
  });

  it("GitHub id가 없으면 던진다 — Account 없이 User만 만들면 첫 로그인이 OAuthAccountNotLinked다", () => {
    expect(() => resolveBackfillOptions(["--owner-email", "a@b.com"])).toThrow();
    expect(() => resolveBackfillOptions(["--owner-email", "a@b.com", "--owner-github-id", ""])).toThrow();
  });

  it("GitHub id가 숫자가 아니면 던진다 — 핸들을 잘못 넘기는 실수를 막는다", () => {
    expect(() =>
      resolveBackfillOptions(["--owner-email", "a@b.com", "--owner-github-id", "SinhyeokKang"]),
    ).toThrow();
  });
});
