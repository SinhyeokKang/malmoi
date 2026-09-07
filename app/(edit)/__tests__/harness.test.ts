import { describe, expect, it } from "vitest";

import { createHarness } from "./harness";

/**
 * 하네스 자체의 계약 — **가짜가 실제 제약보다 관대하면 결함을 원리적으로 못 본다** (POSTMORTEM 2026-09-05).
 * 온보딩(5단계)이 `project.create`·`findUnique({ pushTokenHash })`·`findMany`·`projectMember.count({ userId, role })`를
 * 새로 부르는데, 하네스에 그 경로가 없으면 slug 충돌·토큰 조회를 **재현할 수조차 없다** (tasks T2).
 *
 * 흉내 내는 스키마 제약: `Project.slug @unique` · `Project.pushTokenHash @unique`(NULL 여럿 허용) ·
 * `$transaction` 롤백이 `projects`도 되돌린다.
 */

const row = (over: Partial<{ id: string; slug: string; name: string; pushTokenHash: string | null }> = {}) => ({
  id: "p-new",
  slug: "fresh",
  name: "Fresh",
  repoOwner: "o",
  repoName: "r",
  baseBranch: "main",
  installationId: "1",
  adapterName: "json-catalog",
  pathTemplate: "i18n/{locale}.json",
  nested: false,
  nestedByPath: null,
  baseLocale: "en",
  pushTokenHash: null as string | null,
  ...over,
});

describe("harness — project.create", () => {
  it("행을 만들고 이후 조회가 그 행을 본다 — 저장과 조회가 같은 상태다", async () => {
    const h = createHarness();
    const created = await h.prisma.project.create({ data: row() });
    expect(created.slug).toBe("fresh");
    expect(await h.prisma.project.findUnique({ where: { slug: "fresh" } })).toMatchObject({ id: "p-new" });
    expect(h.projects.map((p) => p.slug)).toContain("fresh");
  });

  it("중복 slug는 P2002로 던진다 — `@unique`를 흉내낸다", async () => {
    const h = createHarness();
    await expect(h.prisma.project.create({ data: row({ id: "p-dup", slug: "acme" }) })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("중복 pushTokenHash는 P2002로 던진다", async () => {
    const h = createHarness();
    await h.prisma.project.create({ data: row({ id: "a", slug: "a", pushTokenHash: "h1" }) });
    await expect(h.prisma.project.create({ data: row({ id: "b", slug: "b", pushTokenHash: "h1" }) })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("pushTokenHash가 null인 행은 여럿이어도 된다 — Postgres unique는 NULL을 비교하지 않는다", async () => {
    const h = createHarness();
    await h.prisma.project.create({ data: row({ id: "a", slug: "a", pushTokenHash: null }) });
    await h.prisma.project.create({ data: row({ id: "b", slug: "b", pushTokenHash: null }) });
    expect(h.projects.filter((p) => p.pushTokenHash === null).length).toBeGreaterThanOrEqual(3);
  });

  it("새 행은 `pushTokenHash`·`lastCommitAt`·`lastCommitSha` 컬럼을 갖는다 — 없으면 readiness·역행 판정을 재현할 수 없다", async () => {
    const h = createHarness();
    const created = await h.prisma.project.create({ data: row() });
    expect(created).toMatchObject({ pushTokenHash: null, lastCommitAt: null, lastCommitSha: null });
  });
});

describe("harness — project.findUnique({ pushTokenHash })", () => {
  it("해시로 행을 돌려준다 — 토큰이 프로젝트를 정한다 (design §3.8)", async () => {
    const h = createHarness({ projects: [{ id: "p1", slug: "acme", pushTokenHash: "hash-1" }] });
    expect(await h.prisma.project.findUnique({ where: { pushTokenHash: "hash-1" } })).toMatchObject({ id: "p1" });
    expect(await h.prisma.project.findUnique({ where: { pushTokenHash: "nope" } })).toBeNull();
  });

  it("null 해시로는 아무 행도 돌려주지 않는다 — 미발급 프로젝트가 인증에 걸리면 fail-open이다", async () => {
    const h = createHarness();
    expect(await h.prisma.project.findUnique({ where: { pushTokenHash: null as unknown as string } })).toBeNull();
  });
});

describe("harness — project.findMany", () => {
  it("전 행을 돌려준다 (pull 순회용)", async () => {
    const h = createHarness({ projects: [{ id: "a", slug: "a" }, { id: "b", slug: "b" }] });
    const all = await h.prisma.project.findMany();
    expect(all.map((p) => p.slug).sort()).toEqual(["a", "b"]);
  });

  it("`where`로 좁힌다", async () => {
    const h = createHarness({ projects: [{ id: "a", slug: "a", installationId: null }, { id: "b", slug: "b" }] });
    const got = await h.prisma.project.findMany({ where: { installationId: { not: null } } });
    expect(got.map((p) => p.slug)).toEqual(["b"]);
  });
});

describe("harness — projectMember.count", () => {
  it("`userId`·`role`로 센다 — OWNER 행만이 3개 제한의 분자다", async () => {
    const h = createHarness({
      projects: [{ id: "a", slug: "a" }, { id: "b", slug: "b" }, { id: "c", slug: "c" }],
      members: [
        { projectId: "a", userId: "u1", role: "OWNER" },
        { projectId: "b", userId: "u1", role: "OWNER" },
        { projectId: "c", userId: "u1", role: "EDITOR" },
        { projectId: "a", userId: "u2", role: "OWNER" },
      ],
    });
    expect(await h.prisma.projectMember.count({ where: { userId: "u1", role: "OWNER" } })).toBe(2);
    expect(await h.prisma.projectMember.count({ where: { userId: "u1" } })).toBe(3);
    // 기존 호출 모양(projectId)도 그대로다.
    expect(await h.prisma.projectMember.count({ where: { projectId: "a", role: "OWNER" } })).toBe(2);
  });
});

describe("harness — $transaction이 project.create를 되돌린다", () => {
  it("콜백이 던지면 만든 행이 사라진다", async () => {
    const h = createHarness();
    await expect(
      h.prisma.$transaction(async (tx) => {
        await tx.project.create({ data: row() });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(h.projects.map((p) => p.slug)).not.toContain("fresh");
  });
});
