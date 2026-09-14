import { beforeEach, expect, it, vi } from "vitest";
import { createHarness } from "@/app/(edit)/__tests__/harness";
import { hashPushToken } from "@/lib/push/token";
const state = vi.hoisted(() => ({ prisma: undefined as unknown, apply: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/push/apply", () => ({ applyPush: state.apply }));
import { POST as push } from "../push/route";
import { POST as failure } from "../push/failure/route";
const token = "surface-token";
const body = { projectSlug: "project", surfaceSlug: "a", commitSha: "a".repeat(40), commitAt: "2026-09-14T00:00:00Z" };
const format = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" };
beforeEach(() => vi.clearAllMocks());
it.each([push, failure])("unknown, foreign and inactive surfaces have identical 409 bodies", async handler => {
  const h = createHarness({ projects: [{ id: "p", slug: "project", pushTokenHash: hashPushToken(token) }, { id: "other", slug: "other" }],
    surfaces: [{ id: "a", projectId: "p", slug: "a" }, { id: "b", projectId: "p", slug: "inactive", archivedAt: new Date(0) }, { id: "c", projectId: "other", slug: "foreign" }] });
  state.prisma = h.prisma;
  const responses = [];
  for (const surfaceSlug of ["missing", "foreign", "inactive"]) {
    const payload = handler === push ? { ...body, surfaceSlug, format, locales: ["en"], keys: [{ key: "hello", sourceText: "Hello", namespace: "_root" }], translations: [], refs: [] } : { ...body, surfaceSlug, code: "parse-failed" };
    const response = await handler(new Request("https://x/api/push", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) }));
    expect(response.status).toBe(409); responses.push(await response.text());
    expect(h.spies.findSurface).toHaveBeenLastCalledWith(expect.objectContaining({ where: { projectId: "p", slug: surfaceSlug, archivedAt: null } }));
  }
  expect(responses).toEqual(Array(3).fill('{"error":"surface mismatch"}'));
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
