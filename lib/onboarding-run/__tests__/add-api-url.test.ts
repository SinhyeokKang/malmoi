import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * **배포 판정이 무효면 소스 추가는 쓰기 전에 실패한다** (self-hosting B1 리뷰 🟡1). `workflowApiUrl`은 무효에서 렌더를 거부(throw)하는데,
 * 그 호출이 표면 커밋 뒤에 있으면 사용자는 오류를 받고 표면은 이미 생겨 다시 시도하면 경로 충돌이 난다 — "커밋했으면 실패라고 말하지
 * 않는다"는 계약이 깨진다. create 경로와 같이 쓰기 전에 판정한다.
 */
const h = vi.hoisted(() => ({ checkRepoAccess: vi.fn(), addSurfacesFromSnapshot: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../access", () => ({ checkRepoAccess: h.checkRepoAccess }));
vi.mock("@/lib/surfaces/create", async (orig) => ({ ...(await orig<object>()), addSurfacesFromSnapshot: h.addSurfacesFromSnapshot }));
const { addSources } = await import("../add");

beforeEach(() => {
  h.checkRepoAccess.mockReset().mockResolvedValue({ status: "error", error: "repo-not-installed" });
  h.addSurfacesFromSnapshot.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const subject = { userId: "owner" };
const seed = () => createHarness({
  projects: [{ id: "p1", slug: "acme", installationId: "1", repositoryId: "1" }],
  members: [{ projectId: "p1", userId: "owner", role: "OWNER" }],
  users: [{ id: "owner", email: "o@a.com" }],
}).prisma as unknown as PrismaClient;
const input = { slug: "acme", picks: [{ adapter: "json-catalog", pathTemplate: "web/{locale}.json", baseLocale: "en" }] };

it("무효 판정이면 GitHub도 표면 쓰기도 부르기 전에 던진다", async () => {
  vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  vi.stubEnv("VERCEL_ENV", "production");
  await expect(addSources(seed(), subject, input, { origin: null })).rejects.toThrow();
  expect(h.checkRepoAccess).not.toHaveBeenCalled();
  expect(h.addSurfacesFromSnapshot).not.toHaveBeenCalled();
});

it("hosted면 그대로 리포 확인으로 간다 — 판정이 앞선 갈래를 바꾸지 않는다", async () => {
  vi.stubEnv("MALMOI_ORIGIN", "");
  vi.stubEnv("VERCEL_ENV", "");
  expect(await addSources(seed(), subject, input, { origin: null })).toEqual({ ok: false, error: "repo-not-installed" });
  expect(h.checkRepoAccess).toHaveBeenCalledTimes(1);
});
