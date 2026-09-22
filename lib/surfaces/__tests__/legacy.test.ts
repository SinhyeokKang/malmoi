import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ surface: { slug: "saved-default", archivedAt: null as Date | null } as { slug: string; archivedAt: Date | null } | null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "authorized" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async ({ where }: { where: { id: string } }) => {
  expect(where).toEqual({ id: "authorized" }); return { defaultSurface: state.surface };
} } }) }));
import Translations from "@/app/(edit)/projects/[slug]/translations/page";
import Locales from "@/app/(edit)/projects/[slug]/locales/page";
it("legacy routes use the saved default, not a hardcoded slug", async () => {
  state.surface = { slug: "saved-default", archivedAt: null };
  await expect(Translations({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({ ns: "common", locales: "ko", q: "hello" }) }))
    .rejects.toThrow("redirect:/projects/demo/surfaces/saved-default/translations?ns=common&locales=ko&q=hello");
  await expect(Locales({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("redirect:/projects/demo/sources");
});
it.each([null, { slug: "gone", archivedAt: new Date(0) }])("a missing or archived default fails closed", async surface => {
  state.surface = surface;
  await expect(Translations({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) })).rejects.toThrow("notFound");
  await expect(Locales({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("redirect:/projects/demo/sources");
});
