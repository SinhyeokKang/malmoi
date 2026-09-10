import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ row: vi.fn(), session: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: state.row } }) }));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
import Page from "../[token]/page";
it("damaged invitation shows unavailable and a retry preserving its link; missing invitation does not", async () => {
  state.session.mockResolvedValue({ status: "none" });
  state.row.mockResolvedValue({ id: "i1", projectId: "p1", email: "damaged" });
  const input = { params: Promise.resolve({ token: "opaque-token" }), searchParams: Promise.resolve({}) };
  const html = renderToStaticMarkup(await Page(input));
  expect(html).toContain('action="/invite/opaque-token"');
  expect(html).toContain("Try again");
  expect(html).not.toContain("damaged");
  state.row.mockResolvedValue(null);
  expect(renderToStaticMarkup(await Page(input))).not.toContain("Try again");
});
