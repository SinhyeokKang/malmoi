import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "../query";
import type { Role } from "../permission";

/**
 * 인가 조회 껍데기. **판정은 `planProjectAccess`가 하고 여기는 두 번 조회한다** — slug로 프로젝트를,
 * 그 `projectId`와 `userId`로 멤버십을.
 *
 * ⚠️ **클라이언트가 보낸 값을 믿지 않는다** (ARCHITECTURE §6.00 ③). 반환되는 `projectId`는 URL의 slug가 아니라
 * **멤버십 행이 가리키는 프로젝트**여야 하고, 멤버십 조회는 반드시 `projectId`로 좁혀야 한다 —
 * `userId`만으로 조회하면 남의 프로젝트 멤버십이 걸려 나올 수 있다 (CLAUDE.md 테넌트 규칙).
 */

type MemberRow = { projectId: string; userId: string; role: Role };

function memoryDb(seed: {
  projects?: { id: string; slug: string; archivedAt?: Date | null }[];
  members?: MemberRow[];
}) {
  const projects = seed.projects ?? [{ id: "p1", slug: "acme" }];
  const members = seed.members ?? [];

  const findProject = vi.fn(async ({ where }: { where: { slug: string } }) => {
    const found = projects.find((p) => p.slug === where.slug);
    // ⚠️ **`archivedAt`을 함께 낸다** (7단계) — 조회가 그 컬럼을 select하고 판정이 그것을 읽는다.
    // 가짜가 빼면 `undefined`가 오고, fail-closed 판정이 정상 프로젝트를 전부 `archived`로 만든다.
    return found === undefined ? null : { id: found.id, archivedAt: found.archivedAt ?? null };
  });

  const findMember = vi.fn(
    async ({ where }: { where: { projectId_userId: { projectId: string; userId: string } } }) => {
      const { projectId, userId } = where.projectId_userId;
      return members.find((m) => m.projectId === projectId && m.userId === userId) ?? null;
    },
  );

  const db = {
    project: { findUnique: findProject },
    projectMember: { findUnique: findMember },
  } as unknown as PrismaClient;

  return { db, findProject, findMember };
}

describe("getProjectAccess — 없는 프로젝트", () => {
  it("slug를 못 찾으면 not-found다", async () => {
    const { db } = memoryDb({ projects: [] });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "nope", permission: "translation:write" }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("프로젝트가 없으면 멤버십을 조회하지 않는다 — 헛된 왕복을 만들지 않는다", async () => {
    const { db, findMember } = memoryDb({ projects: [] });
    await getProjectAccess(db, { userId: "u1", slug: "nope", permission: "translation:write" });
    expect(findMember).not.toHaveBeenCalled();
  });
});

describe("getProjectAccess — 멤버가 아닌 경우", () => {
  it("프로젝트는 있는데 멤버십이 없으면 not-found다 — 존재를 드러내지 않는다", async () => {
    const { db } = memoryDb({ members: [] });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("다른 프로젝트의 멤버가 이 slug를 부르면 not-found다", async () => {
    const { db } = memoryDb({
      projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "other" }],
      members: [{ projectId: "p2", userId: "u1", role: "OWNER" }],
    });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" }),
    ).resolves.toEqual({ status: "not-found" });
  });
});

describe("getProjectAccess — 권한", () => {
  const seeded = { members: [{ projectId: "p1", userId: "u1", role: "EDITOR" as Role }] };

  it("EDITOR는 translation:write로 통과하고 인가된 projectId를 받는다", async () => {
    const { db } = memoryDb(seeded);
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" }),
    ).resolves.toEqual({ status: "ok", projectId: "p1", role: "EDITOR" });
  });

  it("EDITOR의 member:manage는 forbidden이다 — not-found와 구별된다", async () => {
    const { db } = memoryDb(seeded);
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "member:manage" }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("OWNER는 member:manage로 통과한다", async () => {
    const { db } = memoryDb({ members: [{ projectId: "p1", userId: "u1", role: "OWNER" }] });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "member:manage" }),
    ).resolves.toEqual({ status: "ok", projectId: "p1", role: "OWNER" });
  });
});

describe("getProjectAccess — 조회가 projectId로 좁혀진다", () => {
  it("멤버십 조회에 projectId와 userId가 함께 들어간다", async () => {
    const { db, findMember } = memoryDb({
      members: [{ projectId: "p1", userId: "u1", role: "OWNER" }],
    });
    await getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" });
    expect(findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_userId: { projectId: "p1", userId: "u1" } },
      }),
    );
  });

  it("반환하는 projectId는 멤버십 행의 것이다 — slug에서 유추하지 않는다", async () => {
    const { db } = memoryDb({
      projects: [{ id: "authorized-id", slug: "acme" }],
      members: [{ projectId: "authorized-id", userId: "u1", role: "OWNER" }],
    });
    const result = await getProjectAccess(db, {
      userId: "u1",
      slug: "acme",
      permission: "translation:write",
    });
    expect(result).toEqual({ status: "ok", projectId: "authorized-id", role: "OWNER" });
  });
});

/**
 * **보관 조회** (7단계 — ARCHITECTURE §5.6.4). 판정은 `planProjectAccess`가 하고, 여기서 고정하는 것은
 * **그 입력을 이 조회가 든다**는 것이다 — 호출부가 따로 읽으면 진입점마다 왕복이 하나 늘고 조건이 갈린다.
 */
describe("getProjectAccess — 보관", () => {
  it("보관된 프로젝트는 편집 권한에서 archived다", async () => {
    const { db } = memoryDb({
      projects: [{ id: "p1", slug: "acme", archivedAt: new Date("2026-09-10T00:00:00Z") }],
      members: [{ projectId: "p1", userId: "u1", role: "EDITOR" }],
    });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" }),
    ).resolves.toEqual({ status: "archived", projectId: "p1", role: "EDITOR" });
  });

  it("설정은 그대로 통과한다 — 되돌리는 길이다", async () => {
    const { db } = memoryDb({
      projects: [{ id: "p1", slug: "acme", archivedAt: new Date("2026-09-10T00:00:00Z") }],
      members: [{ projectId: "p1", userId: "u1", role: "OWNER" }],
    });
    await expect(
      getProjectAccess(db, { userId: "u1", slug: "acme", permission: "project:settings" }),
    ).resolves.toEqual({ status: "ok", projectId: "p1", role: "OWNER" });
  });

  it("조회가 `archivedAt`을 select한다 — 판정이 그 값을 볼 수 있어야 한다", async () => {
    const { db, findProject } = memoryDb({
      members: [{ projectId: "p1", userId: "u1", role: "EDITOR" }],
    });
    await getProjectAccess(db, { userId: "u1", slug: "acme", permission: "translation:write" });
    expect(findProject.mock.calls[0]?.[0]).toMatchObject({ select: { archivedAt: true } });
  });
});
