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

/**
 * **쓸 수 없는 초대에도 출구가 있다** (audit #15). 없음·만료·사용됨은 재시도가 없는 갈래라 CTA가 `null`이었고, 이 화면은
 * 셸 밖이라 사이드바도 없다 — 링크를 연 사람이 할 수 있는 일이 0이었다. 로그인했으면 자기 목록으로, 아니면 로그인으로.
 */
it.each([
  ["missing", null],
  ["used", { ...valid, acceptedAt: new Date("2026-09-01T00:00:00Z") }],
  ["expired", { ...valid, expiresAt: new Date("2026-01-01T00:00:00Z") }],
])("재시도 없는 막힘(%s)은 로그인 상태에 맞는 출구 하나를 든다", async (_label, row) => {
  state.row.mockResolvedValue(row);
  state.session.mockResolvedValue({ status: "none" });
  const out = renderToStaticMarkup(await Page(input));
  expect(out).not.toContain("Try again");
  expect(out).toContain('href="/signin"');
  expect(out).not.toContain('href="/projects"');

  state.session.mockResolvedValue({ status: "ok", userId: "u" });
  const signed = renderToStaticMarkup(await Page(input));
  expect(signed).toContain('href="/projects"');
  expect(signed).not.toContain('href="/signin"');
});
