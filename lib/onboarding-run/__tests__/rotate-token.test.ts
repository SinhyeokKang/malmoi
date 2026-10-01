import { beforeEach, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 회전 거부의 갈래 (malmoi#159). 설치는 있고 리포 id가 없는 프로젝트(`unpinned`, ux-drift-unify D1)는 Settings가 Disconnected로
 * 말한다 — 거부가 `repo-not-installed`("App을 설치하라")면 같은 카드가 두 원인을 말한다. 쓰기 권한 확인은 고정된 리포 id가
 * 있어야 하므로 **GitHub을 부르지 않고** 거부한다.
 */
const h = vi.hoisted(() => ({ checkRepoAccess: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../access", () => ({ checkRepoAccess: h.checkRepoAccess }));
const { rotateToken } = await import("../rotate-token");

beforeEach(() => { h.checkRepoAccess.mockReset(); });

const subject = { userId: "owner", credential: { kind: "session" } } as never;
const seed = (project: { installationId: string | null; repositoryId: string | null }) => createHarness({
  projects: [{ id: "p1", slug: "acme", ...project }],
  members: [{ projectId: "p1", userId: "owner", role: "OWNER" }],
  users: [{ id: "owner", email: "o@a.com" }],
}).prisma as unknown as PrismaClient;

it.each([
  [{ installationId: "1", repositoryId: null }, "unpinned"],
  [{ installationId: null, repositoryId: null }, "repo-not-installed"],
] as const)("%o → %s, GitHub을 부르지 않는다", async (project, error) => {
  expect(await rotateToken(seed(project), subject, { slug: "acme" })).toEqual({ ok: false, error });
  expect(h.checkRepoAccess).not.toHaveBeenCalled();
});
