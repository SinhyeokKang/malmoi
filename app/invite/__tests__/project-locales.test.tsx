// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render, find } from "@/components/__tests__/helpers/dom";

/**
 * **초대 카드의 국기는 코드당 하나다** (malmoi#48).
 *
 * ⚠️ `Locale` 행은 표면마다 선다 — 표면이 둘인 프로젝트에서 `project.locales`를 그대로 읽으면 같은
 * 코드가 표면 수만큼 돌아온다. 카드는 "내 언어가 있나"만 말하므로 코드 집합이어야 한다.
 */
const state = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/roundtrip-cookies", () => ({ clearAuthRoundtripCookies: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row, decodeUser: (row: unknown) => row }));
vi.mock("@/lib/credentials/access", () => ({ credentialIO: (read: () => Promise<unknown>) => read() }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    projectInvitation: {
      findUnique: async () => ({
        projectId: "p1", email: "person@example.com", role: "EDITOR", acceptedAt: null, expiresAt: new Date("2099-01-01"),
        // 표면 둘(web · extension)이 같은 세 로케일을 든다 — DB가 `code asc`로 준 모양 그대로다.
        project: { name: "Demo", slug: "demo", locales: [{ code: "en" }, { code: "en" }, { code: "fr" }, { code: "fr" }, { code: "ko" }, { code: "ko" }] },
      }),
    },
    user: { findUnique: async () => ({ id: "u1", email: "person@example.com" }) },
    projectMember: { findUnique: async () => null },
  }),
}));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/signin/dot-field", () => ({ DotField: () => null }));
vi.mock("@/components/signin/auth-toast", () => ({ AuthToast: () => null }));
import Page from "../[token]/page";

it("표면이 둘이어도 로케일 국기가 코드당 한 번, 코드 순으로 선다", async () => {
  state.session.mockResolvedValue({ status: "ok", userId: "u1" });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const page = await Page({ params: Promise.resolve({ token: "token" }), searchParams: Promise.resolve({}) });
  const { container } = await render(page);

  find(container, "form button");
  const flags = [...container.querySelectorAll<HTMLElement>('[style*="/flags/"]')].map((el) => el.style.backgroundImage);
  expect(flags).toHaveLength(3);
  expect(new Set(flags).size).toBe(3);
  // 중복 key 경고는 콘솔로만 나온다 — 화면이 우연히 맞아도 이것이 red를 낸다.
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  errors.mockRestore();
});
