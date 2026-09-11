import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ userId: "u" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({ loadProjectList: async () => [] }));
import Page from "../projects/page";

it("중복 q 파라미터가 프로젝트 목록을 오류로 보내지 않는다", async () => {
  await expect(Page({ searchParams: Promise.resolve({ q: ["a", "b"] }) })).resolves.toBeDefined();
});
