import { beforeEach, expect, it, vi } from "vitest";
import { createHarness } from "@/app/(edit)/__tests__/harness";
import { hashPushToken } from "@/lib/push/token";
const state = vi.hoisted(() => ({ prisma: undefined as unknown, apply: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/push/apply", () => ({ applyPush: state.apply }));
vi.mock("@/lib/events/ci", async original => ({ ...(await original<object>()), recordCiImport: state.record }));
// 열린 Malmoi PR 없음 — 표면 경계 거부는 게이트보다 앞이다(nightly-sync D1).
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrForImportGate: async () => null }));
import { POST as push } from "../push/route";
import { POST as failure } from "../push/failure/route";
const token = "surface-token";
const body = { projectSlug: "project", surfaceSlug: "a", commitSha: "a".repeat(40), commitAt: "2026-09-14T00:00:00Z" };
const format = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" };
beforeEach(() => vi.clearAllMocks());
function request(handler: typeof push, surfaceSlug: string) {
  const payload = handler === push ? { ...body, surfaceSlug, format, locales: ["en"], keys: [{ key: "hello", sourceText: "Hello", namespace: "_root" }], translations: [], refs: [] } : { ...body, surfaceSlug, code: "parse-failed" };
  return new Request("https://x/api/push", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
}
it.each([push, failure])("unknown and foreign surfaces have identical 409 bodies and leave no record", async handler => {
  const h = createHarness({ projects: [{ id: "p", slug: "project", pushTokenHash: hashPushToken(token) }, { id: "other", slug: "other" }],
    surfaces: [{ id: "a", projectId: "p", slug: "a" }, { id: "c", projectId: "other", slug: "foreign" }] });
  state.prisma = h.prisma;
  const responses = [];
  for (const surfaceSlug of ["missing", "foreign"]) {
    const response = await handler(request(handler, surfaceSlug));
    expect(response.status).toBe(409); responses.push(await response.text());
    expect(h.spies.findSurface).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "p", slug: surfaceSlug, archivedAt: null } }));
  }
  expect(responses).toEqual(Array(2).fill('{"error":"surface mismatch"}'));
  expect(state.record).not.toHaveBeenCalled();
  expect(state.apply).not.toHaveBeenCalled();
  expect(h.spies.updateManySurfaces).not.toHaveBeenCalled();
});
/**
 * 제거된 소스 (sources-add-remove — ARCHITECTURE §5.5.5 표). 같은 프로젝트에 그 slug의 제거된 행이 있으면 `surface removed`이고 Logs에
 * 거부로 남는다 — 처방(워크플로에서 그 step을 지운다)이 불일치와 달라서다. 적재·실패 보고 쓰기는 없다.
 */
it.each([push, failure])("a removed surface of the same project is refused as surface removed and recorded", async handler => {
  const h = createHarness({ projects: [{ id: "p", slug: "project", pushTokenHash: hashPushToken(token) }],
    surfaces: [{ id: "a", projectId: "p", slug: "a" }, { id: "b", projectId: "p", slug: "removed", archivedAt: new Date(0) }] });
  state.prisma = h.prisma;
  const response = await handler(request(handler, "removed"));
  expect(response.status).toBe(409);
  expect(await response.text()).toBe('{"error":"surface removed"}');
  expect(state.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    projectId: "p", surface: { id: "b", slug: "removed" }, result: "notStarted", refusal: "surface-removed",
  }));
  expect(state.apply).not.toHaveBeenCalled();
  expect(h.spies.updateManySurfaces).not.toHaveBeenCalled();
});
it.each([push, failure])("surfaceSlug is mandatory, not a server default", async handler => {
  state.prisma = createHarness({ projects: [{ id: "p", slug: "project", pushTokenHash: hashPushToken(token) }] }).prisma;
  const { surfaceSlug: _, ...withoutSurface } = body;
  const payload = handler === push ? { ...withoutSurface, format, locales: ["en"], keys: [{ key: "hello", sourceText: "Hello", namespace: "_root" }], translations: [], refs: [] } : { ...withoutSurface, code: "parse-failed" };
  const response = await handler(new Request("https://x/api/push", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }));
  expect(response.status).toBe(400);
});
