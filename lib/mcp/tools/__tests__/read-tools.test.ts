import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";
import { routes } from "@/lib/routes";

import type { TokenGrant, TokenScope } from "../../grant";
import type { ToolOutcome } from "../../result";
import type { ApiTokenSubject } from "../../token-store";

/**
 * **읽기 도구의 입구 판정** (mcp-connector T6 — design §1.25 · §2.1 · §2.4). 역할 조건과 grant 조건은 카탈로그의 별개 필드다 — 판정 순서
 * 범위 → 멤버십·역할·보관 → grant. 인가는 하네스의 실제 판정(`planToolAccess`·`getProjectAccess`)을 지나고, GitHub·집계 코어만 가짜다.
 * ⚠️ 거부 단언마다 "코어를 안 불렀다"를 함께 본다 — 입구가 GitHub보다 먼저여야 범위 밖 토큰이 남의 레이트 리밋을 태우지 않는다.
 */
const h = vi.hoisted(() => ({
  listRepositories: vi.fn(), listNewRepoBranches: vi.fn(), listLinkedBranches: vi.fn(),
  detectFormats: vi.fn(), detectProjectFormats: vi.fn(),
  loadTranslationList: vi.fn(), previewRevert: vi.fn(), prepareSync: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/onboarding-run/repos", () => ({ listRepositories: h.listRepositories }));
vi.mock("@/lib/onboarding-run/branches", () => ({ listNewRepoBranches: h.listNewRepoBranches, listLinkedBranches: h.listLinkedBranches }));
vi.mock("@/lib/onboarding-run/detect", async (orig) => ({ ...(await orig<object>()), detectFormats: h.detectFormats, detectProjectFormats: h.detectProjectFormats }));
vi.mock("@/lib/keys/translation-list", async (orig) => ({ ...(await orig<object>()), loadTranslationList: h.loadTranslationList }));
vi.mock("@/lib/keys/revert-translation", async (orig) => ({ ...(await orig<object>()), previewRevert: h.previewRevert }));
vi.mock("@/lib/import/prepare", () => ({ prepareSync: h.prepareSync }));

const { TOOLS } = await import("..");
const tool = (name: string) => {
  const found = TOOLS.find(t => t.name === name);
  if (found === undefined) throw new Error(name);
  return found;
};

let prisma: PrismaClient;
beforeEach(() => {
  prisma = createHarness({
    projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "other" }],
    members: [
      { projectId: "p1", userId: "owner", role: "OWNER" }, { projectId: "p1", userId: "editor", role: "EDITOR" },
      { projectId: "p2", userId: "owner", role: "OWNER" }, { projectId: "p2", userId: "editor", role: "EDITOR" },
    ],
    users: [{ id: "owner", email: "o@a.com" }, { id: "editor", email: "e@a.com" }],
  }).prisma as unknown as PrismaClient;
  for (const fn of Object.values(h)) fn.mockReset();
  h.listRepositories.mockResolvedValue({ ok: true, repos: [{ owner: "o", repo: "r", fullName: "o/r", pushedAt: null }], pending: false });
  h.listNewRepoBranches.mockResolvedValue({ ok: true, names: ["main", "malmoi-i18n/sync-acme"], defaultBranch: "main", truncated: false });
  h.listLinkedBranches.mockResolvedValue({ ok: true, names: ["main"], defaultBranch: "main", truncated: false });
  h.detectFormats.mockResolvedValue({ ok: true, candidates: [] });
  h.detectProjectFormats.mockResolvedValue({ ok: true, candidates: [] });
  h.loadTranslationList.mockResolvedValue({ rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, nextCursor: null });
  h.previewRevert.mockResolvedValue({ status: "ready", locales: [], confirmation: "c".repeat(64) });
  h.prepareSync.mockResolvedValue({ approval: "a".repeat(64), unsent: 0 });
});

function subject(userId: string, grants: TokenGrant[] = [], scope: TokenScope = { kind: "all" }): ApiTokenSubject {
  return { userId, grants, scope, tokenId: `hash-${userId}` };
}
const call = (name: string, who: ApiTokenSubject, input: Record<string, unknown>): Promise<ToolOutcome> =>
  tool(name).run({ prisma, subject: who, now: new Date("2026-09-28T00:00:00Z") }, input as never);
const status = (outcome: ToolOutcome) => outcome.status === "refused" ? outcome.code : outcome.status;

const SURFACE = { slug: "acme", surfaceSlug: "default" };

describe("역할 × 빈 grants", () => {
  it.each(["owner", "editor"])("%s는 grant 없이 list_keys를 읽는다", async who => {
    expect(status(await call("list_keys", subject(who), SURFACE))).toBe("ok");
  });

  it("기존 프로젝트 list_branches는 OWNER 역할만 보고 grant를 요구하지 않는다 — EDITOR는 forbidden", async () => {
    expect(status(await call("list_branches", subject("owner"), { slug: "acme" }))).toBe("ok");
    expect(status(await call("list_branches", subject("editor"), { slug: "acme" }))).toBe("forbidden");
    expect(h.listLinkedBranches).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["preview_sync", { slug: "acme" }],
    ["preview_revert", { ...SURFACE, keyId: "k1" }],
    ["get_workflow", { slug: "acme" }],
  ] as const)("%s는 OWNER만 — EDITOR는 forbidden이고 코어에 닿지 않는다", async (name, input) => {
    expect(status(await call(name, subject("editor"), input))).toBe("forbidden");
    expect(h.previewRevert).not.toHaveBeenCalled();
    expect(h.prepareSync).not.toHaveBeenCalled();
    // 대조: OWNER는 입구를 지난다(get_workflow는 표면 없는 하네스 행이라 not-ready가 아닌 이상 ok).
    expect(status(await call(name, subject("owner"), input))).not.toBe("forbidden");
  });

  it.each([
    ["list_repositories", {}],
    ["list_branches", { owner: "o", repo: "r" }],
    ["detect_formats", { owner: "o", repo: "r" }],
  ] as const)("빈 grants의 %s(신규)는 token-scope — GitHub을 부르지 않는다", async (name, input) => {
    expect(status(await call(name, subject("owner"), input))).toBe("token-scope");
    expect(h.listRepositories).not.toHaveBeenCalled();
    expect(h.listNewRepoBranches).not.toHaveBeenCalled();
    expect(h.detectFormats).not.toHaveBeenCalled();
  });

  it("기존 detect_formats — OWNER는 token-scope, EDITOR는 forbidden(역할이 먼저다)", async () => {
    expect(status(await call("detect_formats", subject("owner"), { slug: "acme" }))).toBe("token-scope");
    expect(status(await call("detect_formats", subject("editor"), { slug: "acme" }))).toBe("forbidden");
    expect(h.detectProjectFormats).not.toHaveBeenCalled();
  });

  it("Project settings만 받은 토큰은 기존 프로젝트 탐지가 되고 project:create가 필요 없다", async () => {
    const settingsOnly = subject("owner", ["project:settings"], { kind: "projects", projectIds: ["p1"] });
    expect(status(await call("detect_formats", settingsOnly, { slug: "acme" }))).toBe("ok");
    expect(h.detectProjectFormats).toHaveBeenCalledExactlyOnceWith(prisma, { userId: "owner", tokenId: "hash-owner" }, { kind: "existing", slug: "acme" });
    // 같은 토큰의 신규 경로는 project:create가 없다.
    expect(status(await call("detect_formats", settingsOnly, { owner: "o", repo: "r" }))).toBe("token-scope");
  });
});

describe("범위", () => {
  const PROJECT_TOOLS: [string, Record<string, unknown>][] = [
    ["get_project", { slug: "acme" }], ["list_keys", SURFACE], ["get_key", { ...SURFACE, keyId: "k1" }], ["preview_sync", { slug: "acme" }],
    ["preview_revert", { ...SURFACE, keyId: "k1" }], ["list_events", { slug: "acme" }], ["get_workflow", { slug: "acme" }],
    ["list_members", { slug: "acme" }], ["list_branches", { slug: "acme" }], ["detect_formats", { slug: "acme" }],
  ];

  it.each(PROJECT_TOOLS)("범위 밖 프로젝트의 %s는 not-found — 역할·보관이 새지 않는다", async (name, input) => {
    const scoped = subject("owner", ["project:settings", "translation:write", "member:manage", "project:create"], { kind: "projects", projectIds: ["p2"] });
    expect(status(await call(name, scoped, input))).toBe("not-found");
  });

  it.each(PROJECT_TOOLS)("allProjects=false + 빈 projectIds면 %s도 not-found", async (name, input) => {
    expect(status(await call(name, subject("owner", [], { kind: "projects", projectIds: [] }), input))).toBe("not-found");
  });

  it("list_projects는 멤버십 ∩ 범위다", async () => {
    const outcome = await call("list_projects", subject("owner", [], { kind: "projects", projectIds: ["p2"] }), {});
    expect(outcome.status === "ok" && (outcome.data.projects as { slug: string }[]).map(p => p.slug)).toEqual(["other"]);
  });
});

describe("입력 경로 — 섞지 않는다", () => {
  it.each([
    ["list_branches", { owner: "o", repo: "r", slug: "acme" }],
    ["detect_formats", { owner: "o", repo: "r", slug: "acme" }],
    ["detect_formats", { slug: "acme", ref: "feature" }],
    ["detect_formats", { owner: "o" }],
    ["list_branches", {}],
  ] as const)("%s %j는 invalid-input — 어느 코어도 부르지 않는다", async (name, input) => {
    expect(status(await call(name, subject("owner", ["project:create", "project:settings"]), input))).toBe("invalid-input");
    for (const fn of [h.listNewRepoBranches, h.listLinkedBranches, h.detectFormats, h.detectProjectFormats]) expect(fn).not.toHaveBeenCalled();
  });

  it("기존 프로젝트 탐지가 거부돼도 신규 경로로 폴백하지 않는다", async () => {
    h.detectProjectFormats.mockResolvedValue({ ok: false, error: "repo-read-only" });
    expect(status(await call("detect_formats", subject("owner", ["project:settings", "project:create"]), { slug: "acme" }))).toBe("repo-read-only");
    expect(h.detectFormats).not.toHaveBeenCalled();
  });

  it("sync 브랜치는 목록에서 뺀다", async () => {
    const outcome = await call("list_branches", subject("owner", ["project:create"]), { owner: "o", repo: "r" });
    expect(outcome.status === "ok" && outcome.data.branches).toEqual(["main"]);
  });
});

describe("needs-browser (design §2.4)", () => {
  it.each(["not-connected", "reauthorize", "no-installations"] as const)("%s는 /account 하나로 보낸다 — URL에 비밀값이 없다", async error => {
    h.listRepositories.mockResolvedValue({ ok: false, error, pending: false });
    const outcome = await call("list_repositories", subject("owner", ["project:create"]), {});
    expect(outcome).toEqual({ status: "needs-browser", reason: error, url: routes.account() });
    expect(routes.account()).not.toMatch(/[?&#]/);
  });

  it("후보 없음은 신규면 /projects/new, 기존이면 그 프로젝트의 Sources", async () => {
    h.detectFormats.mockResolvedValue({ ok: false, error: "no-candidates" });
    h.detectProjectFormats.mockResolvedValue({ ok: false, error: "no-candidates" });
    const all = subject("owner", ["project:create", "project:settings"]);
    expect(await call("detect_formats", all, { owner: "o", repo: "r" })).toEqual({ status: "needs-browser", reason: "no-candidates", url: routes.newProject() });
    expect(await call("detect_formats", all, { slug: "acme" })).toEqual({ status: "needs-browser", reason: "no-candidates", url: routes.sources("acme") });
  });

  it.each(["repo-forbidden", "unavailable", "resource-limit", "repo-read-only"])("%s는 브라우저 전환으로 숨기지 않는다", async error => {
    h.detectFormats.mockResolvedValue({ ok: false, error });
    expect(status(await call("detect_formats", subject("owner", ["project:create"]), { owner: "o", repo: "r" }))).toBe(error);
  });
});

describe("노출 — 화면과 같은 경계", () => {
  it("list_members는 이메일 원문을 싣지 않고, 대기 초대는 OWNER에게만 보인다", async () => {
    prisma = createHarness({
      projects: [{ id: "p1", slug: "acme" }],
      members: [{ projectId: "p1", userId: "owner", role: "OWNER" }, { projectId: "p1", userId: "editor", role: "EDITOR" }],
      users: [{ id: "owner", email: "owner@example.com", name: "Olive" }, { id: "editor", email: "editor@example.com" }],
      invitations: [{ id: "inv", projectId: "p1", email: "invitee@example.com", role: "EDITOR", tokenHash: "t", expiresAt: new Date("2026-10-01T00:00:00Z"), acceptedAt: null, invitedBy: "owner" }],
    }).prisma as unknown as PrismaClient;
    const asOwner = await call("list_members", subject("owner"), { slug: "acme" });
    const asEditor = await call("list_members", subject("editor"), { slug: "acme" });
    // 라벨은 도메인을 남기고 로컬 파트를 가린다(`maskedEmailLabels`) — 로컬 파트 원문이 없어야 한다.
    for (const outcome of [asOwner, asEditor]) expect(JSON.stringify(outcome)).not.toMatch(/owner@|editor@|invitee@/);
    expect(asOwner.status === "ok" && asOwner.data.pendingInvitations).toHaveLength(1);
    expect(asEditor.status === "ok" && asEditor.data.pendingInvitations).toEqual([]);
  });

  it("whoami는 토큰의 권한·범위를 말하고 다른 사용자의 행을 읽지 않는다", async () => {
    const findFirst = vi.fn(async () => ({ expiresAt: new Date("2026-12-01T00:00:00Z") }));
    prisma = Object.assign(Object.create(prisma), { apiToken: { findFirst } }) as PrismaClient;
    const outcome = await call("whoami", subject("owner", ["translation:write"], { kind: "projects", projectIds: ["p1"] }), {});
    // 해시까지 조건이다 — 재발급된 새 행의 만료를 옛 토큰의 것으로 말하지 않는다.
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner", tokenHash: "hash-owner" } }));
    expect(outcome).toMatchObject({ status: "ok", data: { token: { grants: ["translation:write"], scope: { kind: "projects", projectIds: ["p1"] } } } });
  });
});
