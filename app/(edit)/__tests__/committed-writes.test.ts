import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **커밋된 쓰기는 캐시 장애로 실패가 되지 않는다** (POSTMORTEM 2026-09-20 · mcp-connector T4 회귀 목록). 추출한 코어가 커밋된 결과를 돌려준
 * 뒤 `revalidatePath`가 던지면 Action이 reject되고, 화면은 이미 된 일을 실패로 말한다(초대는 다시 보내고 토큰은 다시 회전한다).
 * 코어는 커밋된 결과를 그대로 돌려주는 가짜다 — 여기서 재는 것은 Action의 커밋 뒤 한 겹이다.
 */
const h = vi.hoisted(() => ({ revalidatePath: vi.fn(), core: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
const core = (name: string) => (...args: unknown[]) => h.core(name, ...args);
vi.mock("@/lib/settings/update", async (orig) => ({ ...(await orig<object>()), changeBaseBranch: core("changeBaseBranch") }));
vi.mock("@/lib/auth/members", async (orig) => ({ ...(await orig<object>()), revokePendingInvitation: core("revoke"), changeMemberRole: core("change") }));
vi.mock("@/lib/invitation-email/create", async (orig) => ({ ...(await orig<object>()), inviteMembers: core("invite") }));
vi.mock("@/lib/projects/archive", () => ({ runArchive: core("archive"), runUnarchive: core("unarchive") }));
vi.mock("@/lib/onboarding-run/rotate-token", () => ({ rotateToken: core("rotate") }));
vi.mock("@/lib/onboarding-run/create", async (orig) => ({ ...(await orig<object>()), createProjectFromRepo: core("create") }));
vi.mock("@/lib/onboarding-run/import", async (orig) => ({ ...(await orig<object>()), importRepository: core("import") }));
vi.mock("@/lib/onboarding-run/add", async (orig) => ({ ...(await orig<object>()), addSources: core("add") }));

const projects = await import("../projects/actions");
const settings = await import("../projects/[slug]/settings/actions");

const RESULTS: Record<string, unknown> = {
  changeBaseBranch: { ok: true },
  revoke: { ok: true },
  change: { ok: true },
  invite: { result: { ok: true, count: 1 }, issued: true },
  archive: { ok: true },
  unarchive: { ok: true },
  rotate: { ok: true, pushToken: "raw" },
  create: { ok: true, slug: "acme", defaultSurfaceSlug: "i18n", pushToken: "raw", baseBranch: "main", surfaces: [], count: 1, yaml: "" },
  import: { outcome: { ok: true, surfaces: [], remainingEdits: 0 }, attempted: true },
  add: { ok: true, results: [], yaml: "" },
};

beforeEach(() => {
  h.revalidatePath.mockReset().mockImplementation(() => { throw new Error("cache down"); });
  h.core.mockReset().mockImplementation(async (name: string) => RESULTS[name]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const CASES: [string, () => Promise<unknown>, unknown][] = [
  ["updateRepositorySettings", () => settings.updateRepositorySettings({ slug: "acme", baseBranch: "main" }), { ok: true }],
  ["revokeInvitation", () => projects.revokeInvitation({ slug: "acme", invitationId: "i1" }), { ok: true }],
  ["changeMember", () => projects.changeMember({ slug: "acme", targetUserId: "u2", nextRole: "EDITOR" }), { ok: true }],
  ["createInvitations", () => projects.createInvitations({ slug: "acme", recipients: [{ email: "a@b.com", role: "EDITOR" }] }), { ok: true, count: 1 }],
  ["archiveProject", () => projects.archiveProject("acme"), { ok: true }],
  ["unarchiveProject", () => projects.unarchiveProject("acme"), { ok: true }],
  ["rotatePushToken", () => projects.rotatePushToken({ slug: "acme" }), { ok: true, pushToken: "raw" }],
  ["createProject", () => projects.createProject({ owner: "o", repo: "r", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }], slug: "acme", name: "Acme", baseBranch: "main" }), RESULTS.create],
  ["runRepositoryImport", () => projects.runRepositoryImport({ slug: "acme", approval: null }), { ok: true, surfaces: [], remainingEdits: 0 }],
  ["addSurfaces", () => projects.addSurfaces({ slug: "acme", picks: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] }), { ok: true, results: [], yaml: "" }],
];

describe("커밋 뒤 revalidatePath가 던져도 커밋된 결과를 그대로 돌려준다", () => {
  it.each(CASES)("%s", async (_name, run, expected) => {
    expect(await run()).toEqual(expected);
    // 재검증을 부르긴 했다 — 안 부르고 green인 것이 아니다.
    expect(h.revalidatePath).toHaveBeenCalled();
  });

  it("앞 경로가 던져도 뒤 경로를 건너뛰지 않는다 — 기준 브랜치는 설정과 세그먼트 둘을 지운다", async () => {
    await settings.updateRepositorySettings({ slug: "acme", baseBranch: "main" });
    expect(h.revalidatePath.mock.calls).toEqual([["/projects/acme/settings"], ["/projects/acme", "layout"]]);
  });
});
