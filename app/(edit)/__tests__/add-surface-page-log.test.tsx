import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({ repoOwner: "o", repoName: "r", baseBranch: "main", archivedAt: null }) } }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ detectRepoFormats: state.detect }));
vi.mock("@/components/onboarding/add-surface", () => ({ AddSurface: () => null }));
import Page from "../projects/[slug]/surfaces/new/page";

/**
 * 탐지 장애는 `unavailable` 초기값으로 접힌다 — 원인을 볼 곳이 서버 로그 한 줄뿐이다 (launch-readiness L5.2).
 */
let log: { mock: { calls: unknown[][] }; mockRestore: () => void };
beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => log.mockRestore());
const input = { params: Promise.resolve({ slug: "alpha" }), searchParams: Promise.resolve({}) };

it("탐지 장애는 분류 한 줄, 성공은 0줄", async () => {
  state.detect.mockResolvedValue({ ok: true, candidates: [] });
  await Page(input);
  expect(log).not.toHaveBeenCalled();
  state.detect.mockRejectedValue(Object.assign(new Error("secret"), { status: 502 }));
  const element = await Page(input);
  expect(element.props.initial).toEqual({ ok: false, error: "unavailable" });
  expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[surface\] \w{8} detect: http-502$/)]);
});
