import { expect, it, vi } from "vitest";
const forbidden = vi.hoisted(() => vi.fn(() => { throw new Error("private dependency called"); }));
vi.mock("@/lib/db", () => ({ getPrisma: forbidden }));
vi.mock("@/auth", () => ({ auth: forbidden }));
vi.mock("next/headers", () => ({ cookies: forbidden }));
vi.mock("@/lib/guide/load", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/guide/load")>();
  return { ...original, loadSummary: vi.fn(original.loadSummary) };
});
import { loadSummary } from "@/lib/guide/load";
import { dynamic, GET } from "../route";

it("공개 가이드만 정적으로 서빙하고 세션·DB·쿠키를 부르지 않는다", async () => {
  expect(dynamic).toBe("force-static");
  const response = GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["docs"]);
  expect(body.docs.length).toBeGreaterThan(28);
  expect(JSON.stringify(body)).not.toMatch(/AUTHORING|SHOOTING/);
  expect(forbidden).not.toHaveBeenCalled();
});

it("가이드 읽기 실패는 빈 색인으로 숨기지 않고 빌드를 실패시킨다", () => {
  vi.mocked(loadSummary).mockImplementationOnce(() => { throw new Error("missing guide"); });
  expect(() => GET()).toThrow("missing guide");
});
