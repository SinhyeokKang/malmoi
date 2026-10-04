import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";
import { accessErrorMessage } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { en } from "@/messages/en";

import { toolCatalog } from "../../catalog";
import type { TokenGrant, TokenScope } from "../../grant";
import { toToolResult, type ToolOutcome } from "../../result";
import { executeTool } from "../execute";
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
  TOOLS.find(t => t.name === name)!.run({ prisma, subject: who, now: new Date(), origin: null }, input as never);
/** 실제 MCP 경로 — 도구가 던지면 `executeTool`이 `unavailable`로 접는다. 부분 성공이 그 catch에 지워지는지를 여기서 잰다. */
const exec = (name: string, who: ApiTokenSubject, input: Record<string, unknown>, db: PrismaClient = prisma) =>
  executeTool(TOOLS.find(t => t.name === name)!, () => ({ prisma: db, subject: who, now: new Date(), origin: null }), input);
const code = (outcome: ToolOutcome) => outcome.status === "refused" ? outcome.code : outcome.status;
const ALL: TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];
const subject = (userId: string, grants: TokenGrant[] = ALL, scope: TokenScope = { kind: "all" }): ApiTokenSubject => ({ userId, grants, scope, credential: { kind: "api-token", tokenHash: `hash-${userId}` } });

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
    expect(h.core).toHaveBeenCalledWith("create", prisma, { userId: "owner", credential: { kind: "api-token", tokenHash: "hash-owner" } },
      { owner: "o", repo: "r", slug: "new", name: "New", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] },
      { confirmations: ["c"], origin: null });
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

  it("중복 키 거부는 그 keyId를 싣는다", async () => {
    expect(toToolResult(await run("set_translations", subject("owner"), { ...S, entries: [entry("k1"), entry("k1")] })).structuredContent)
      .toMatchObject({ status: "duplicate-key", keyId: "k1", message: m.mcp.errors["duplicate-key"] });
  });

  it("거부된 키는 그 키만 rejected이고 나머지는 saved — 저장된 셀이 있으면 번역 화면들을 다시 그린다", async () => {
    h.core.mockResolvedValueOnce({ ok: true, results: [
      { keyId: "k1", result: { ok: false, error: "key-unavailable" } },
      { keyId: "k2", result: { ok: true, keyId: "k2", cells: [{ localeCode: "ko", value: "v" }] } },
    ] });
    const outcome = await run("set_translations", subject("editor"), { ...S, entries: [entry("k1"), entry("k2")] });
    expect(outcome.status === "ok" && outcome.data.results).toEqual([
      { keyId: "k1", status: "rejected", error: "key-unavailable", message: m.translations.workspace.footer.keyGone },
      { keyId: "k2", status: "saved", cells: [{ localeCode: "ko", value: "v" }] },
    ]);
    expect(h.revalidatePath.mock.calls).toEqual([["/projects/acme", "layout"], ["/projects"], ["/projects/new"]]);
  });
});

/**
 * **적재 lease 중 쓰기** (sync-lock C4 · R2). `set_translations`는 호출 **전체**를 한 번 거부한다 — 키별 결과가 없다. `revert_to_last_sent`도 lease
 * 갈래는 같은 코드이고, Publish RUNNING 갈래는 `busy`로 남는다. 둘 다 `retryable: true` + 다시 열리는 시각을 싣는다.
 */
describe("sync-running", () => {
  const startedAt = new Date("2026-10-01T16:30:12.345Z");
  const reopensBy = new Date("2026-10-01T16:36:00.000Z");
  const detail = { startedAt: "2026-10-01T16:30:12.345Z", reopensBy: "2026-10-01T16:36:00.000Z" };

  it("set_translations — 배치 전체 거부 · 키별 결과 없음 · 다시 그리지 않는다", async () => {
    h.core.mockResolvedValueOnce({ ok: false, error: "sync-running", startedAt, reopensBy });
    const outcome = await run("set_translations", subject("editor"), { ...S, entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "v" }] }, { keyId: "k2", changes: [{ localeCode: "ko", value: "v" }] }] });
    expect(outcome).toEqual({ status: "refused", code: "sync-running", detail });
    const result = toToolResult(outcome);
    expect(result.structuredContent).toEqual({ ...detail, status: "sync-running", message: m.repositorySync.errors["already-running"], retryable: true });
    expect("results" in result.structuredContent).toBe(false);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("revert_to_last_sent — lease는 sync-running(+시각), Publish RUNNING은 busy 그대로", async () => {
    const input = { ...S, keyId: "k1", confirmation: "c".repeat(64) };
    h.core.mockResolvedValueOnce({ status: "blocked", reason: "sync-running", startedAt, reopensBy });
    expect(toToolResult(await run("revert_to_last_sent", subject("owner"), input)).structuredContent)
      .toEqual({ ...detail, status: "sync-running", message: m.repositorySync.errors["already-running"], retryable: true });
    h.core.mockResolvedValueOnce({ status: "blocked", reason: "busy" });
    expect(toToolResult(await run("revert_to_last_sent", subject("owner"), input)).structuredContent)
      .toEqual({ status: "busy", message: m.translations.workspace.revert.busy });
  });
});

describe("preview_publish", () => {
  const preview = () => run("preview_publish", subject("editor", []), { slug: "acme" });
  it("grant 없는 EDITOR도 지문을 받는다 — 실행은 publish가 역할·grant를 다시 본다", async () => {
    expect(await preview()).toMatchObject({ status: "ok", data: { fingerprint: "f", sendable: { total: 1, keys: 1 } } });
  });
  it("base 파일이 없으면 Publish 화면의 같은 문장이다", async () => {
    h.core.mockResolvedValueOnce({ status: "refused", reason: "base-file-missing", path: "i18n/en.json", branch: "main" });
    expect(toToolResult(await preview()).content[0]?.text).toBe(m.translations.publish.baseFileMissing.description("i18n/en.json", "main"));
  });
  it("읽기 실패는 unavailable · retryable", async () => {
    h.core.mockResolvedValueOnce({ status: "failed" });
    expect(toToolResult(await preview()).structuredContent).toMatchObject({ status: "unavailable", retryable: true });
  });
});

describe("publish 실패 — 코드(`SyncErrorCode`)로 가른다", () => {
  const failed = (over: Record<string, unknown>) => h.core.mockResolvedValueOnce({ outcome: { status: "failed", delivery: "not-started", ...over }, attempted: true });
  const publishNow = () => run("publish", subject("editor"), { slug: "acme", fingerprint: "f" });

  it("다시 해도 같은 실패(설정)는 refused — Publish 화면의 configError 문장과 서버의 safe 메시지, 재시도 표시 없음", async () => {
    failed({ error: "The base language file couldn't be read.", code: "base-unreadable", retryable: false });
    const result = toToolResult(await publishNow());
    const text = result.content[0]?.text ?? "";
    expect(text).toContain(m.translations.publish.configError);
    expect(text).toContain(m.translations.publish.configErrorDescription("o/r", "main"));
    expect(result.structuredContent).toMatchObject({ status: "base-unreadable", reason: "The base language file couldn't be read.", delivery: "not-started" });
    expect("retryable" in result.structuredContent).toBe(false);
  });

  it("장애는 unavailable · retryable이고 code와 delivery를 싣는다(전송 여부를 숨기지 않는다 — 불변식 9)", async () => {
    failed({ error: "internal (ref abc)", code: "github-error", retryable: true, delivery: "unknown" });
    const result = toToolResult(await publishNow());
    expect(result.structuredContent).toMatchObject({ status: "unavailable", retryable: true, code: "github-error", delivery: "unknown" });
    expect(JSON.stringify(result)).not.toContain("internal (ref");
  });

  it("too-soon은 retryAfterSeconds를 싣는다", async () => {
    failed({ error: "too-soon", retryable: true, retryAfterSeconds: 17 });
    expect(toToolResult(await publishNow()).structuredContent).toMatchObject({ status: "too-soon", retryAfterSeconds: 17, message: m.translations.publish.tooSoonBody });
  });

  it("실행 전 거부(잠금 뒤 인가)는 그 코드의 화면 문장이다", async () => {
    failed({ error: "forbidden", retryable: false });
    expect(toToolResult(await publishNow()).structuredContent).toMatchObject({ status: "forbidden", message: accessErrorMessage("forbidden") });
  });
});

/**
 * **writer 경고는 영어 문장으로 나간다** — 실행은 코드로 싣지만(ui-locales B1′) 도구 응답의 계약은 바뀌기 전과 같은 `표면: 파일: 문장`이다.
 */
describe("publish — writer 경고", () => {
  it("코드로 온 경고를 en 사전으로 조립해 outcome.warnings에 싣는다", async () => {
    h.core.mockResolvedValueOnce({ outcome: { status: "skipped", reason: "writer-warnings", warnings: [
      { surfaceSlug: "web", path: "i18n/ko.json", code: "value-not-string", key: "a.b" },
      { surfaceSlug: "web", path: "i18n/ko.json", code: "parse-failed", detail: "Unexpected token" },
    ] }, attempted: true });
    const result = toToolResult(await run("publish", subject("editor"), { slug: "acme", fingerprint: "f" }));
    expect(result.structuredContent).toMatchObject({ outcome: { status: "skipped", reason: "writer-warnings", warnings: [
      `web: i18n/ko.json: a.b — ${en.adapterErrors["value-not-string"]}`,
      `web: i18n/ko.json: ${en.adapterErrors["parse-failed"]} (Unexpected token)`,
    ] } });
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

  /**
   * ⚠️ **거부 코드 값 목록은 외부 계약이다** (ux-drift-unify r1 · Q12와 같은 결) — 화면은 리포 id 미고정을 `unpinned`로 가르지만
   * `sync_repository`의 `code`는 넓히지 않는다: 경계가 `not-connected`로 접는다. 문장은 화면과 같은 키다.
   */
  /** 토큰 회전의 `unpinned`(malmoi#159)도 같은 결 — 코어가 화면용으로 가른 코드를 외부에는 전과 같은 `repo-not-installed`로 낸다. */
  it("rotate_push_token 거부 unpinned는 출력 경계에서 repo-not-installed 코드다", async () => {
    h.core.mockResolvedValueOnce({ ok: false, error: "unpinned" });
    expect(code(await run("rotate_push_token", subject("owner"), { slug: "acme" }))).toBe("repo-not-installed");
  });

  it("Sync 거부 unpinned는 출력 경계에서 not-connected 코드이고 문장은 화면의 Disconnected다", async () => {
    h.core.mockResolvedValueOnce({ outcome: { ok: false, error: "unpinned" }, attempted: true });
    expect(await run("sync_repository", subject("owner"), { slug: "acme", approval: "a" }))
      .toMatchObject({ status: "refused", code: "not-connected", message: m.repositorySync.errors.unpinned });
    h.core.mockResolvedValueOnce({ outcome: { ok: false, error: "not-connected" }, attempted: true });
    expect(await run("sync_repository", subject("owner"), { slug: "acme", approval: "a" }))
      .toMatchObject({ status: "refused", code: "not-connected", message: m.repositorySync.errors["not-connected"] });
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

  it("확인값 실패는 어느 후보인지(index)를 싣는다", async () => {
    h.core.mockResolvedValueOnce({ ok: false, error: "sample-expired", index: 1 });
    const input = { owner: "o", repo: "r", slug: "new", name: "New", baseBranch: "main", surfaces: [CONFIRMED, CONFIRMED] };
    expect(toToolResult(await run("create_project", subject("owner"), input)).structuredContent).toMatchObject({ status: "sample-expired", index: 1 });
    h.core.mockResolvedValueOnce({ ok: false, error: "invalid input", index: 0 });
    expect(toToolResult(await run("add_sources", subject("owner"), { slug: "acme", picks: [CONFIRMED] })).structuredContent).toMatchObject({ status: "invalid-input", index: 0 });
  });

  it("update_project — 이름은 됐는데 브랜치가 거부되면 이름 성공을 지우지 않는다", async () => {
    h.core.mockImplementation(async (name: string) => name === "branch" ? { ok: false, error: "invalid-branch" } : RESULTS[name]);
    const outcome = await run("update_project", subject("owner"), { slug: "acme", name: "New", baseBranch: "bad name" });
    expect(outcome).toMatchObject({ status: "ok", data: { changed: { name: "New" }, failed: { baseBranch: "invalid-branch" } } });
  });
});

// Codex review CR-02 — 뒤 단계의 예외가 이미 커밋된 결과를 지우지 않는다(POSTMORTEM 2026-09-20).
describe("update_project — 이름 커밋 뒤 브랜치 코어가 던지면", () => {
  const branchThrows = () => h.core.mockImplementation(async (name: string) => {
    if (name === "branch") throw new Error("connection reset");
    return RESULTS[name];
  });

  it("changed.name을 남기고 브랜치를 '확인 불가'로 알린다 — 거부도 일괄 unavailable도 아니다", async () => {
    branchThrows();
    const result = await exec("update_project", subject("owner"), { slug: "acme", name: "New", baseBranch: "release" });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ changed: { name: "New" }, unconfirmed: ["baseBranch"] });
    expect(result.content[0]?.text).toBe(m.mcp.summary.branchUnconfirmed);
    expect(JSON.stringify(result)).not.toContain("connection reset");
  });

  it("브랜치만 요청했으면 그대로 unavailable · retryable이다", async () => {
    branchThrows();
    const result = await exec("update_project", subject("owner"), { slug: "acme", baseBranch: "release" });
    expect(result.structuredContent).toMatchObject({ status: "unavailable", retryable: true });
  });
});

// Codex review CR-03 — 리포 라벨용 보조 조회가 실행 결과를 지우지 않는다.
describe("publish — 실행 뒤 리포 라벨 조회가 실패하면", () => {
  const failed = (over: Record<string, unknown>) => h.core.mockResolvedValueOnce({ outcome: { status: "failed", ...over }, attempted: true });
  /** 입구 판정의 조회는 통과시키고, 리포 라벨(`repoOwner`) 조회만 던지는 클라이언트. `labelCalls`가 그 조회 횟수다. */
  let labelCalls = 0;
  const labelLookupThrows = (): PrismaClient => {
    labelCalls = 0;
    const project = new Proxy(prisma.project, {
      get: (target, prop, receiver) => prop !== "findUnique" ? Reflect.get(target, prop, receiver) : (args: { select?: Record<string, unknown> }) => {
        if (args.select !== undefined && "repoOwner" in args.select) {
          labelCalls += 1;
          return Promise.reject(new Error("pool timeout"));
        }
        return target.findUnique(args as never);
      },
    });
    return new Proxy(prisma, { get: (target, prop, receiver) => prop === "project" ? project : Reflect.get(target, prop, receiver) });
  };

  it("장애(retryable)는 라벨을 조회하지 않고 code·delivery를 그대로 싣는다", async () => {
    const db = labelLookupThrows();
    failed({ error: "internal (ref abc)", code: "github-error", retryable: true, delivery: "unknown" });
    const result = await exec("publish", subject("editor"), { slug: "acme", fingerprint: "f" }, db);
    expect(result.structuredContent).toMatchObject({ status: "unavailable", retryable: true, code: "github-error", delivery: "unknown" });
    expect(labelCalls).toBe(0);
  });

  it("설정 오류는 slug 라벨로 떨어지고 code·delivery·재시도 없음을 지킨다", async () => {
    const db = labelLookupThrows();
    failed({ error: "The base language file couldn't be read.", code: "base-unreadable", retryable: false, delivery: "not-started" });
    const result = await exec("publish", subject("editor"), { slug: "acme", fingerprint: "f" }, db);
    expect(labelCalls).toBe(1);
    expect(result.structuredContent).toMatchObject({ status: "base-unreadable", delivery: "not-started" });
    expect("retryable" in result.structuredContent).toBe(false);
    expect(result.content[0]?.text).toContain(m.translations.publish.configErrorDescription("acme", ""));
  });
});

// Codex review CR-04 — 열린 PR "모름"을 "없음"으로 접지 않는다.
describe("preview_publish — 열린 PR 세 상태", () => {
  const withPr = (openPr: unknown) => h.core.mockResolvedValueOnce({ status: "ok", preview: { ...(RESULTS.preview as { preview: object }).preview, openPr } });
  const pr = async () => (await exec("preview_publish", subject("editor", []), { slug: "acme" })).structuredContent.pullRequest;

  it("열림 · 없음 · 확인 불가가 직렬화 뒤에도 갈린다", async () => {
    withPr({ number: 7, url: "https://github.com/o/r/pull/7" });
    expect(await pr()).toEqual({ status: "open", number: 7, url: "https://github.com/o/r/pull/7" });
    withPr(null);
    expect(await pr()).toEqual({ status: "none" });
    withPr(undefined);
    expect(JSON.parse(JSON.stringify(await pr()))).toEqual({ status: "unknown" });
  });
});
