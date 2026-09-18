import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ row: vi.fn(), session: vi.fn(), user: vi.fn(), member: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: state.row }, user: { findUnique: state.user }, projectMember: { findUnique: state.member } }) }));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
import Page from "../[token]/page";
import { encodeInvitationEmail, encodeUserFields } from "@/lib/credentials/records";
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

/**
 * 초대·계정 조회 장애는 "잠시 뒤 다시" 화면으로 접힌다 — 원인을 볼 곳이 서버 로그 한 줄뿐이다 (launch-readiness L5.2).
 * `credentialIO`가 원인 한 줄(`[credentials]`)을 이미 찍으므로 여기 줄은 **어느 단계였나**를 더한다.
 */
let log: { mock: { calls: unknown[][] }; mockRestore: () => void };
beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => log.mockRestore());
const inviteLines = () => log.mock.calls.map((c) => String(c[0])).filter((line) => line.startsWith("[invite]"));
const input = { params: Promise.resolve({ token: "opaque-token" }), searchParams: Promise.resolve({}) };
const valid = {
  id: "i1", projectId: "p1", ...encodeInvitationEmail("i1", "p1", "guest@a.com"), role: "EDITOR",
  expiresAt: new Date("2126-01-01T00:00:00Z"), acceptedAt: null,
  project: { name: "Alpha", slug: "alpha", locales: [{ code: "ko" }] },
};

it("초대 조회 장애는 [invite] 한 줄", async () => {
  state.session.mockResolvedValue({ status: "none" });
  state.row.mockRejectedValue(new Error("secret row"));
  await Page(input);
  expect(inviteLines()).toEqual([expect.stringMatching(/^\[invite\] \w{8} page-invitation: CredentialError$/)]);
});

it("계정·멤버십 조회 장애는 [invite] 한 줄, 성공은 0줄", async () => {
  state.session.mockResolvedValue({ status: "ok", userId: "u" });
  state.row.mockResolvedValue(valid);
  state.user.mockResolvedValue({ id: "u", ...encodeUserFields("u", { email: "guest@a.com" }) });
  state.member.mockResolvedValue(null);
  await Page(input);
  expect(log).not.toHaveBeenCalled();
  state.member.mockRejectedValue(new Error("secret row"));
  await Page(input);
  expect(inviteLines()).toEqual([expect.stringMatching(/^\[invite\] \w{8} page-viewer: Error$/)]);
});
