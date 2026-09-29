import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * `/account`의 설치된 리포 수도 GitHub 대기 마감 안이다 (ARCHITECTURE §6.5.2 · malmoi#107 ③). 설치 목록·설치별 리포 조회가
 * 멈추면 페이지가 `maxDuration`까지 매달린다 — 넘기면 `null`("말할 수 없다" — 화면이 그 줄을 안 그린다)이다.
 */

const hoisted = vi.hoisted(() => ({ ensureUserToken: vi.fn(), listUserInstallations: vi.fn(), listInstallationRepos: vi.fn() }));
vi.mock("../token-store", () => ({ ensureUserToken: hoisted.ensureUserToken }));
vi.mock("../user", () => ({ listUserInstallations: hoisted.listUserInstallations, listInstallationRepos: hoisted.listInstallationRepos }));

const { loadInstalledRepoCount } = await import("../installed-repos");
const prisma = {} as PrismaClient;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.ensureUserToken.mockResolvedValue({ status: "ok", accessToken: "user-token" });
  hoisted.listUserInstallations.mockResolvedValue(["1"]);
  hoisted.listInstallationRepos.mockResolvedValue([{ fullName: "acme/one" }]);
});

describe("마감", () => {
  it.each([
    ["설치 목록", () => hoisted.listUserInstallations.mockReturnValue(new Promise(() => {}))],
    ["설치별 리포", () => hoisted.listInstallationRepos.mockReturnValue(new Promise(() => {}))],
  ])("%s 조회가 응답하지 않으면 8초에서 null이고 한 줄을 남긴다", async (_, hang) => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      hang();
      const count = loadInstalledRepoCount(prisma, "u1");
      await vi.advanceTimersByTimeAsync(7_999);
      expect(log).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(count).resolves.toBeNull();
      expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[github-connect\] \w{8} installed-repos-deadline: AppError$/)]);
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });

  it("마감 안의 응답은 그대로 흐른다 — 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    try {
      await expect(loadInstalledRepoCount(prisma, "u1")).resolves.toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
