import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";
import { accessErrorMessage } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

import { toolCatalog } from "../../catalog";
import type { TokenGrant, TokenScope } from "../../grant";
import { toToolResult, type ToolOutcome } from "../../result";
import type { ApiTokenSubject } from "../../token-store";

/**
 * **쓰기 도구의 입구 판정과 결과 문장** (mcp-connector T7 — design §1.25 · §2.2 · §2.3). 역할 ∩ 토큰: 쓰기는 역할과 **같은** grant를 요구한다.
 * 코어는 가짜다 — 여기서 재는 것은 입구(범위 → 멤버십·역할·보관 → grant)와 거부 문장이 화면과 같은 키를 가리키는가이다. 잠금 뒤 재판정은
 * PG(`lib/mcp/__tests__/*.integration.ts`)가 잰다.
 */
const h = vi.hoisted(() => ({ core: vi.fn(), revalidatePath: vi.fn() }));
const core = (name: string) => (...args: unknown[]) => h.core(name, ...args);
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/keys/save-translation", async (orig) => ({ ...(await orig<object>()), saveTranslationBatch: core("save") }));
vi.mock("@/lib/sync/publish", () => ({ publishProject: core("publish") }));
vi.mock("@/lib/publish/load-preview", () => ({ loadPreview: core("preview") }));
vi.mock("@/lib/onboarding-run/import", async (orig) => ({ ...(await orig<object>()), importRepository: core("sync") }));
vi.mock("@/lib/keys/revert-translation", async (orig) => ({ ...(await orig<object>()), runRevert: core("revert") }));
vi.mock("@/lib/settings/update", async (orig) => ({ ...(await orig<object>()), renameProject: core("rename"), changeBaseBranch: core("branch") }));
vi.mock("@/lib/sources/base-locale", async (orig) => ({ ...(await orig<object>()), declareBaseLocale: core("base") }));
vi.mock("@/lib/onboarding-run/rotate-token", () => ({ rotateToken: core("rotate") }));
vi.mock("@/lib/invitation-email/create", async (orig) => ({ ...(await orig<object>()), inviteMembers: core("invite") }));
vi.mock("@/lib/auth/members", async (orig) => ({ ...(await orig<object>()), revokePendingInvitation: core("revoke"), changeMemberRole: core("change") }));
vi.mock("@/lib/projects/archive", () => ({ runArchive: core("archive"), runUnarchive: core("unarchive") }));
vi.mock("@/lib/onboarding-run/create", async (orig) => ({ ...(await orig<object>()), createProjectFromRepo: core("create") }));
vi.mock("@/lib/onboarding-run/add", async (orig) => ({ ...(await orig<object>()), addSources: core("add") }));

const { TOOLS } = await import("..");
const run = (name: string, who: ApiTokenSubject, input: Record<string, unknown>): Promise<ToolOutcome> =>
  TOOLS.find(t => t.name === name)!.run({ prisma, subject: who, now: new Date() }, input as never);
const code = (outcome: ToolOutcome) => outcome.status === "refused" ? outcome.code : outcome.status;
const ALL: TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];
const subject = (userId: string, grants: TokenGrant[] = ALL, scope: TokenScope = { kind: "all" }): ApiTokenSubject => ({ userId, grants, scope, tokenId: `hash-${userId}` });

const RESULTS: Record<string, unknown> = {
  save: { ok: true, results: [{ keyId: "k1", result: { ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "v" }] } }] },
  publish: { outcome: { status: "committed", pr: "created", delivered: 1, commitSha: "c", prUrl: "https://github.com/o/r/pull/1", changed: ["a.json"] }, attempted: true },
  preview: { status: "ok", preview: { fingerprint: "f", sendable: { total: 1, keys: 1 }, changedFiles: [], total: 1, keys: 1, withoutFile: 0, withoutKey: 0, openPr: null, groups: [] } },
  sync: { outcome: { ok: true, surfaces: [], remainingEdits: 0 }, attempted: true },
  revert: { status: "reverted", cells: [] },
  rename: { ok: true, name: "New" }, branch: { ok: true }, base: { ok: true },
  rotate: { ok: true, pushToken: "raw" },
  invite: { result: { ok: true, count: 1 }, issued: true },
  revoke: { ok: true }, change: { ok: true }, archive: { ok: true }, unarchive: { ok: true },
  create: { ok: true, slug: "new", defaultSurfaceSlug: "i18n", pushToken: "raw", baseBranch: "main", surfaces: [], count: 1, yaml: "" },
  add: { ok: true, results: [], yaml: "" },
};

let prisma: PrismaClient;
beforeEach(() => {
  prisma = createHarness({
    projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "other" }],
    members: [{ projectId: "p1", userId: "owner", role: "OWNER" }, { projectId: "p1", userId: "editor", role: "EDITOR" }, { projectId: "p2", userId: "owner", role: "OWNER" }],
    users: [{ id: "owner", email: "o@a.com" }, { id: "editor", email: "e@a.com" }],
  }).prisma as unknown as PrismaClient;
  h.core.mockReset().mockImplementation(async (name: string) => RESULTS[name]);
  h.revalidatePath.mockReset();
});

const S = { slug: "acme", surfaceSlug: "default" };
const CONFIRMED = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", confirmation: "c" };
const WRITES: [string, Record<string, unknown>][] = [
  ["set_translations", { ...S, entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "v" }] }] }],
  ["publish", { slug: "acme", fingerprint: "f" }],
  ["sync_repository", { slug: "acme", approval: "a" }],
  ["revert_to_last_sent", { ...S, keyId: "k1", confirmation: "c".repeat(64) }],
  ["update_project", { slug: "acme", name: "New" }],
  ["set_base_locale", { ...S, baseLocale: "en" }],
  ["rotate_push_token", { slug: "acme" }],
  ["invite_members", { slug: "acme", recipients: [{ email: "x@y.com", role: "EDITOR" }] }],
  ["revoke_invitation", { slug: "acme", invitationId: "i1" }],
  ["change_member", { slug: "acme", targetUserId: "editor", nextRole: "OWNER" }],
  ["archive_project", { slug: "acme" }],
  ["unarchive_project", { slug: "acme" }],
  ["add_sources", { slug: "acme", picks: [CONFIRMED] }],
];
const roleOf = (name: string) => {
  const access = toolCatalog().find(t => t.name === name)!.access;
  return "rolePermission" in access ? access.rolePermission : null;
};

describe("역할 × grant × 범위", () => {
  it.each(WRITES)("%s — 역할과 grant가 다 있으면 코어까지 간다", async (name, input) => {
    expect(code(await run(name, subject("owner"), input))).toBe("ok");
    expect(h.core).toHaveBeenCalled();
  });

  it.each(WRITES)("%s — 역할은 되는데 grant가 없으면 token-scope이고 코어에 닿지 않는다(읽기 토큰의 미리보기 핸들로 못 쓴다)", async (name, input) => {
    const grant = roleOf(name)!;
    expect(code(await run(name, subject("owner", ALL.filter(g => g !== grant)), input))).toBe("token-scope");
    expect(h.core).not.toHaveBeenCalled();
  });

  it.each(WRITES.filter(([name]) => roleOf(name) !== "translation:write"))("%s — EDITOR는 grant가 있어도 forbidden(역할이 먼저)", async (name, input) => {
    expect(code(await run(name, subject("editor"), input))).toBe("forbidden");
    expect(h.core).not.toHaveBeenCalled();
  });

  it.each(WRITES.filter(([name]) => roleOf(name) === "translation:write"))("%s — EDITOR도 grant가 있으면 된다", async (name, input) => {
    expect(code(await run(name, subject("editor"), input))).toBe("ok");
  });

  it.each(WRITES)("%s — 범위 밖 프로젝트는 not-found", async (name, input) => {
    expect(code(await run(name, subject("owner", ALL, { kind: "projects", projectIds: ["p2"] }), input))).toBe("not-found");
    expect(h.core).not.toHaveBeenCalled();
  });

  it("create_project는 project:create만 본다 — 없으면 token-scope", async () => {
    const input = { owner: "o", repo: "r", slug: "new", name: "New", baseBranch: "main", surfaces: [CONFIRMED] };
    expect(code(await run("create_project", subject("owner", ["project:settings"]), input))).toBe("token-scope");
    expect(code(await run("create_project", subject("owner", ["project:create"]), input))).toBe("ok");
    // 확인값은 코어로 따로 넘어가고 표면 입력에는 없다 — 웹 입력 계약은 그대로다.
    expect(h.core).toHaveBeenCalledWith("create", prisma, { userId: "owner", tokenId: "hash-owner" },
      { owner: "o", repo: "r", slug: "new", name: "New", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] },
      { confirmations: ["c"] });
  });
});

describe("set_translations 입력", () => {
  const entry = (keyId: string) => ({ keyId, changes: [{ localeCode: "ko", value: "v" }] });
  it("101키는 too-many · 중복 키는 duplicate-key · 빈 목록은 invalid-input — 셋 다 입구 판정·코어 전이다", async () => {
    expect(code(await run("set_translations", subject("owner"), { ...S, entries: Array.from({ length: 101 }, (_, i) => entry(`k${i}`)) }))).toBe("too-many");
    expect(code(await run("set_translations", subject("owner"), { ...S, entries: [entry("k1"), entry("k1")] }))).toBe("duplicate-key");
    expect(code(await run("set_translations", subject("owner"), { ...S, entries: [] }))).toBe("invalid-input");
    expect(h.core).not.toHaveBeenCalled();
  });

  it("거부된 키는 그 키만 rejected이고 나머지는 saved — 저장된 셀이 있으면 번역 화면들을 다시 그린다", async () => {
    h.core.mockResolvedValueOnce({ ok: true, results: [
      { keyId: "k1", result: { ok: false, error: "key-unavailable" } },
      { keyId: "k2", result: { ok: true, keyId: "k2", cells: [{ localeCode: "ko", value: "v" }] } },
    ] });
    const outcome = await run("set_translations", subject("editor"), { ...S, entries: [entry("k1"), entry("k2")] });
    expect(outcome.status === "ok" && outcome.data.results).toEqual([
      { keyId: "k1", status: "rejected", error: "key-unavailable" },
      { keyId: "k2", status: "saved", cells: [{ localeCode: "ko", value: "v" }] },
    ]);
    expect(h.revalidatePath.mock.calls).toEqual([["/projects/acme", "layout"], ["/projects"], ["/projects/new"]]);
  });
});

describe("결과 문장은 화면과 같은 키", () => {
  it("Publish 거부 — reconfirm은 Logs의 문장, 동시 실행·간격은 Publish 모달의 문장", async () => {
    h.core.mockResolvedValueOnce({ outcome: { status: "skipped", reason: "reconfirm" }, attempted: true });
    expect(toToolResult(await run("publish", subject("editor"), { slug: "acme", fingerprint: "f" })).content[0]?.text).toBe(m.logs.reasons.reconfirm);
    h.core.mockResolvedValueOnce({ outcome: { status: "failed", error: "already-running", delivery: "not-started", retryable: false }, attempted: true });
    expect(toToolResult(await run("publish", subject("editor"), { slug: "acme", fingerprint: "f" })).content[0]?.text).toBe(m.translations.publish.alreadyRunningBody);
    // 실행기에 닿았으면 거부에도 다시 그린다(웹과 같다).
    expect(h.revalidatePath).toHaveBeenCalled();
  });

  it("Sync 거부는 Home의 Sync 결과 문장이다", async () => {
    h.core.mockResolvedValueOnce({ outcome: { ok: false, error: "reconfirm" }, attempted: true });
    expect(toToolResult(await run("sync_repository", subject("owner"), { slug: "acme", approval: "a" })).content[0]?.text).toBe(m.repositorySync.errors.reconfirm);
  });

  it("Revert의 잠금 뒤 재측정 불일치는 번역 화면의 문장", async () => {
    h.core.mockResolvedValueOnce({ status: "reconfirm" });
    expect(toToolResult(await run("revert_to_last_sent", subject("owner"), { ...S, keyId: "k1", confirmation: "c".repeat(64) })).content[0]?.text)
      .toBe(m.translations.workspace.revert.changed.body);
  });

  it("코어의 접근 거부(잠금 뒤 재판정)는 화면의 접근 문장", async () => {
    h.core.mockResolvedValueOnce({ ok: false, error: "last-owner" });
    expect(toToolResult(await run("change_member", subject("owner"), { slug: "acme", targetUserId: "owner", nextRole: "EDITOR" })).content[0]?.text).toBe(accessErrorMessage("last-owner"));
  });

  it("초대의 메일 실패는 멤버 화면의 문장이고 초대는 다시 그린다", async () => {
    h.core.mockResolvedValueOnce({ result: { ok: false, error: "email-rejected", retryAt: "2026-09-29T00:00:00.000Z" }, issued: true });
    const result = toToolResult(await run("invite_members", subject("owner"), { slug: "acme", recipients: [{ email: "x@y.com", role: "EDITOR" }] }));
    expect(result.content[0]?.text).toBe(m.members.invite.sendFailed);
    expect(result.structuredContent).toMatchObject({ status: "email-rejected", retryAt: "2026-09-29T00:00:00.000Z" });
    expect(h.revalidatePath).toHaveBeenCalledWith("/projects/acme/members");
  });

  it("update_project — 이름은 됐는데 브랜치가 거부되면 이름 성공을 지우지 않는다", async () => {
    h.core.mockImplementation(async (name: string) => name === "branch" ? { ok: false, error: "invalid-branch" } : RESULTS[name]);
    const outcome = await run("update_project", subject("owner"), { slug: "acme", name: "New", baseBranch: "bad name" });
    expect(outcome).toMatchObject({ status: "ok", data: { changed: { name: "New" }, failed: { baseBranch: "invalid-branch" } } });
  });
});
