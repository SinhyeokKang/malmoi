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
  // `nestedByPath`는 넣지 않는다 — Prisma의 nullable Json은 `null`이 아니라 `Prisma.DbNull`을 받는다.
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

  it("id를 생략하면 하네스가 채운다 — 실 Prisma의 `@default(cuid())`와 같은 호출 모양이다 (code-review 2026-09-07 🟡1)", async () => {
    const h = createHarness();
    const { id: _dropped, ...noId } = row();
    void _dropped;
    const created = await h.prisma.project.create({ data: noId });
    expect(typeof created.id).toBe("string");
    expect(created.id.length).toBeGreaterThan(0);
    // 이어지는 멤버 행이 그 id로 이어져야 한다 — undefined면 `getProjectAccess`의 projectId 대조가 항상 참이 된다.
    expect(await h.prisma.project.findUnique({ where: { id: created.id } })).toMatchObject({ slug: "fresh" });
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

  it("null 해시 조회는 던진다 — 실 Prisma도 unique where에 null을 거부한다(PrismaClientValidationError). 미발급 행이 걸리면 fail-open이다", async () => {
    const h = createHarness();
    await expect(h.prisma.project.findUnique({ where: { pushTokenHash: null as unknown as string } })).rejects.toThrow();
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

  it("지원하지 않는 where 연산자는 던진다 — 조용히 빈 배열을 내면 순회 테스트가 '프로젝트 0개'로 통과한다", async () => {
    const h = createHarness();
    await expect(h.prisma.project.findMany({ where: { slug: { in: ["acme"] } } })).rejects.toThrow();
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

/**
 * ⚠️ **`select`한 필드만 낸다** (2026-09-08 code-review 🟡6). 실제 Prisma가 그렇다 — 원본 행을 통째로
 * 돌려주면 가짜가 실제보다 관대해져서, 호출부가 select 안 한 필드를 읽어도 **테스트는 green이고
 * 프로덕션만 `undefined`** 가 된다. 이 리포가 이미 한 번 밟은 형태다 (POSTMORTEM 2026-09-05).
 */
describe("harness — projectMember.findMany가 select를 지킨다", () => {
  const seed = {
    projects: [
      { id: "p1", slug: "acme", name: "Acme" },
      { id: "p2", slug: "beta", name: "Beta" },
    ],
    members: [
      { projectId: "p2", userId: "u1", role: "EDITOR" as const },
      { projectId: "p1", userId: "u1", role: "OWNER" as const },
    ],
  };

  it("select 밖의 필드는 없다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.projectMember.findMany({
      where: { userId: "u1" },
      select: { role: true, project: { select: { slug: true, name: true } } },
    });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["project", "role"]);
  });

  it("select가 없으면 행 전체다 — 기존 호출부가 그렇게 쓴다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.projectMember.findMany({ where: { userId: "u1" } });
    // ⚠️ **`createdAt`이 늘었다** (2026-09-08 6b-2). 스키마에 있는 컬럼이고 `loadMembers`가 "Joined …"로
    // 읽는다 — 가짜가 그것을 안 들면 실제보다 **좁아서** 나는 실패가 되고, 그건 프로덕션 신호가 아니다.
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["createdAt", "projectId", "role", "userId"]);
  });

  it("정렬 뒤에도 select 밖 필드가 새지 않는다 — 정렬은 원본 행을 봐야 한다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.projectMember.findMany({
      where: { userId: "u1" },
      select: { role: true, project: { select: { slug: true, name: true } } },
      orderBy: { project: { slug: "asc" } },
    });
    expect(rows.map((r) => (r as { project: { slug: string } }).project.slug)).toEqual(["acme", "beta"]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["project", "role"]);
  });
});

/**
 * **진행률 집계의 두 델리게이트** (6b-5). `localeProgress`가 순수 함수라 그 자체는 이미 테스트되지만,
 * **분자·분모를 뽑는 조회가 관대하면 집계가 아무 값이나 맞는 것처럼 보인다** — 이 하네스 자기검사가
 * 없으면 화면 테스트가 통과하면서 프로덕션이 틀린 숫자를 낸다 (POSTMORTEM 2026-09-06과 같은 축).
 *
 * 흉내 내는 것: `StringKey.orphaned` 필터 · `Translation.value != ""` · `stringKey.orphaned` 관계 필터 ·
 * `projectId` 테넌트 좁힘 · `select` 밖 필드 차단.
 */
describe("harness — 진행률 집계의 조회 둘 (6b-5)", () => {
  const seed = {
    projects: [{ id: "pA", slug: "alpha" }, { id: "pB", slug: "beta" }],
    keys: [
      { id: "k1", projectId: "pA", key: "a.one", sourceText: "One", description: null, sortIndex: 0, orphaned: false },
      { id: "k2", projectId: "pA", key: "a.two", sourceText: "Two", description: null, sortIndex: 1, orphaned: false },
      // 코드에서 사라진 키 — 분모에도 분자에도 들어가면 안 된다.
      { id: "k3", projectId: "pA", key: "a.gone", sourceText: "Gone", description: null, sortIndex: 2, orphaned: true },
      { id: "kB", projectId: "pB", key: "b.one", sourceText: "One", description: null, sortIndex: 0, orphaned: false },
    ],
    locales: [
      { projectId: "pA", code: "en", isBase: true },
      { projectId: "pA", code: "ko" },
      { projectId: "pB", code: "en", isBase: true },
    ],
    translations: [
      { keyId: "k1", localeCode: "ko", value: "하나", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-01") },
      // 빈 값 — 편집 UI에서 값을 지우면 이 모양으로 남는다. 번역으로 세면 안 된다.
      { keyId: "k2", localeCode: "ko", value: "", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-01") },
      // 죽은 키의 번역 — 관계 필터가 없으면 분자가 분모보다 커진다.
      { keyId: "k3", localeCode: "ko", value: "사라짐", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-01") },
      { keyId: "k1", localeCode: "en", value: "One", description: null, placeholders: null, needsReview: true, updatedBy: null, updatedAt: new Date("2026-09-01") },
      // 남의 테넌트 — projectId 좁힘이 없으면 새어 들어온다.
      { keyId: "kB", localeCode: "en", value: "One", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-01") },
    ],
  };

  it("`stringKey.count`가 orphaned를 실제로 거른다 — 분모에 죽은 키가 남으면 100%에 못 닿는다", async () => {
    const h = createHarness(seed);
    expect(await h.prisma.stringKey.count({ where: { projectId: "pA", orphaned: false } })).toBe(2);
    // 필터가 없으면 셋이다 — 그 차이가 이 검사가 공허하지 않다는 증거다.
    expect(await h.prisma.stringKey.count({ where: { projectId: "pA" } })).toBe(3);
  });

  it("`stringKey.count`가 `projectId`로 좁힌다", async () => {
    const h = createHarness(seed);
    expect(await h.prisma.stringKey.count({ where: { projectId: "pB", orphaned: false } })).toBe(1);
  });

  it("`translation.findMany`가 빈 값과 죽은 키의 번역을 둘 다 뺀다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.translation.findMany({
      where: { projectId: "pA", value: { not: "" }, stringKey: { orphaned: false } },
      select: { localeCode: true, needsReview: true },
    });
    expect(rows).toEqual([
      { localeCode: "ko", needsReview: false },
      { localeCode: "en", needsReview: true },
    ]);
  });

  it("필터를 하나씩 빼면 결과가 달라진다 — 페이크가 필터를 무시하지 않는다", async () => {
    const h = createHarness(seed);
    // 빈 값 필터만 뺀다 → k2의 빈 셀이 들어온다.
    const noEmptyFilter = await h.prisma.translation.findMany({
      where: { projectId: "pA", stringKey: { orphaned: false } },
      select: { localeCode: true, needsReview: true },
    });
    expect(noEmptyFilter).toHaveLength(3);
    // orphaned 필터만 뺀다 → k3의 번역이 들어온다.
    const noOrphanFilter = await h.prisma.translation.findMany({
      where: { projectId: "pA", value: { not: "" } },
      select: { localeCode: true, needsReview: true },
    });
    expect(noOrphanFilter).toHaveLength(3);
  });

  it("`select` 밖의 필드가 새지 않는다 — 화면이 안 받은 값을 쓰게 되면 계약이 거짓이다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.translation.findMany({
      where: { projectId: "pA", value: { not: "" }, stringKey: { orphaned: false } },
      select: { localeCode: true, needsReview: true },
    });
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["localeCode", "needsReview"]);
  });

  it("남의 테넌트 번역이 새어 들어오지 않는다", async () => {
    const h = createHarness(seed);
    const rows = await h.prisma.translation.findMany({
      where: { projectId: "pB", value: { not: "" }, stringKey: { orphaned: false } },
      select: { localeCode: true, needsReview: true },
    });
    expect(rows).toEqual([{ localeCode: "en", needsReview: false }]);
  });
});
