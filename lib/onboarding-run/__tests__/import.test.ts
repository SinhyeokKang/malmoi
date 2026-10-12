import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { en } from "@/messages/en";
import { planImportRefusal } from "@/lib/import/refusal";

/**
 * **수동 Sync 거부 코드 둘을 가른다** (ux-drift-unify r1). `not-connected`는 `checkRepoAccess` → `ensureUserToken`이 내는
 * **"이 사람의 GitHub 계정이 연결되지 않았다"**(ConnectError)이고, 리포 id가 고정되지 않은 프로젝트는 `unpinned`다.
 * 한 코드로 두면 Google로만 로그인한 둘째 OWNER가 멀쩡한 리포에서 Sync를 눌러 "This repository is disconnected" + [Reconnect]를 본다.
 * 판정 함수가 아니라 실제 경로(`importRepository` → `runAuthorized`)로 잰다.
 */
const h = vi.hoisted(() => ({ checkRepoAccess: vi.fn(), runFromReader: vi.fn(), health: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/query", () => ({ getProjectAccess: async () => ({ status: "ok", projectId: "p1", role: "OWNER", archived: false }) }));
vi.mock("../access", () => ({ checkRepoAccess: h.checkRepoAccess }));
vi.mock("@/lib/import/run", () => ({ runRepositoryImportFromReader: h.runFromReader }));
vi.mock("@/lib/events/record", () => ({ recordImportRefusal: async () => {} }));
vi.mock("@/lib/repo-host", async (orig) => ({ ...(await orig<object>()), loadConnectionHealth: h.health }));

const { importRepository } = await import("../import");

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1", archivedAt: null, repoHost: "github", gitlabConnectionId: null, installationId: "1", repositoryId: "10", repoOwner: "o", repoName: "r", baseBranch: "main",
  surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }], ...over,
});
const prismaWith = (row: unknown) => ({ project: { findUnique: async () => row } }) as unknown as PrismaClient;
const subject = { userId: "u1", credential: undefined } as never;

beforeEach(() => { h.checkRepoAccess.mockReset(); h.runFromReader.mockReset(); h.health.mockReset().mockResolvedValue({ status: "ok" }); });

describe("importRepository — 연결 거부 둘", () => {
  it("리포 id가 없으면 unpinned다 — 계정 확인까지 가지 않는다", async () => {
    const { outcome } = await importRepository(prismaWith(project({ repositoryId: null })), subject, { slug: "acme", approval: null });
    expect(outcome).toEqual({ ok: false, error: "unpinned" });
    expect(h.checkRepoAccess).not.toHaveBeenCalled();
  });

  it("계정이 연결되지 않았으면 not-connected이고, 그 문구는 리포 끊김을 말하지 않는다", async () => {
    h.checkRepoAccess.mockResolvedValueOnce({ status: "rejected", error: "not-connected" });
    const { outcome } = await importRepository(prismaWith(project()), subject, { slug: "acme", approval: null });
    expect(outcome).toEqual({ ok: false, error: "not-connected" });
    expect(h.runFromReader).not.toHaveBeenCalled();
    expect(en.repositorySync.errors["not-connected"]).not.toMatch(/disconnected/i);
    expect(en.repositorySync.errors["not-connected"]).toMatch(/account/i);
    // 리포를 다시 연결하는 버튼이 아니다 — 계정 복구는 설정의 계정 줄이 든다.
    expect(planImportRefusal("not-connected").action).not.toBe("reconnect");
  });

  it("unpinned만 Disconnected 낱말과 [Reconnect]를 든다", () => {
    expect(en.repositorySync.errors.unpinned).toBe(en.home.banner.disconnected.title);
    expect(planImportRefusal("unpinned")).toEqual({ tone: "warning", dismissible: false, action: "reconnect" });
  });
});

/**
 * **수동 Sync가 Home의 열린 PR 메모를 지운다** (ux-drift-unify U15). 리포에서 PR을 머지한 사람이 다음에 누르는 버튼이라, 그 뒤 Home이
 * TTL 동안 옛 "PR 열림"을 말하지 않게 한다. 거부에도 지운다 — 사람이 다시 확인하러 온 순간이다.
 */
describe("importRepository — 열린 PR 메모", () => {
  it("인가를 지난 실행은 거부로 끝나도 그 프로젝트의 항목을 지운다", async () => {
    const { homeOpenPrMemo } = await import("@/lib/projects/open-pr-memo");
    const identity = { repoOwner: "o", repoName: "r", repoHost: "github", gitlabConnectionId: null, installationId: "1", repositoryId: "10" };
    await homeOpenPrMemo.load("acme", identity, async () => "https://github.com/o/r/pull/3");
    await importRepository(prismaWith(project({ repositoryId: null })), subject, { slug: "acme", approval: null });
    const again = vi.fn(async () => null);
    expect(await homeOpenPrMemo.load("acme", identity, again)).toBeNull();
    expect(again).toHaveBeenCalledOnce();
  });
});

/**
 * **연결자 쪽 실패에서의 수동 Sync** (감사 E4 · 결정 R6). 호출자 확인은 **호출자 PAT**로 하므로 통과하지만, 리더는 **프로젝트 참조 연결 PAT**로
 * 연다 — 토큰 주인의 PAT가 만료·철회됐거나 GitLab 프로젝트가 보관되면 리더 열기가 `not-installed`로 던지고, 실행권을 얻은 뒤라 모든 소스가 실패
 * 상태(`ingest-failed`)로 남았다. Home은 그 상태에서 Sync를 끄지만(D25) MCP·Action 직접 호출은 막지 않았다.
 * → 실행권을 얻기 **전에** 프로젝트 연결 건강성으로 거부한다. 실행(`runRepositoryImportFromReader`)이 소스 상태를 쓰는 유일한 자리라, 그것이
 * 불리지 않으면 소스 실패 상태도 `ingest-failed`도 남지 않는다.
 */
describe("importRepository — GitLab 프로젝트 연결을 쓸 수 없다", () => {
  const gitlab = () => project({ repoHost: "gitlab", installationId: null, gitlabConnectionId: "owner-conn", repositoryId: "87515176" });
  const callerOk = { status: "ok", host: "gitlab", repositoryId: "87515176", connectionId: "caller-conn", repoOwner: "o", repoName: "r" };

  it("토큰 주인 쪽 연결이 못 쓰는 상태면 실행 전에 gitlab-project-disconnected로 거부한다 — 소스 실패·ingest-failed가 남지 않는다", async () => {
    h.checkRepoAccess.mockResolvedValueOnce(callerOk);
    h.health.mockResolvedValueOnce({ status: "connection-unusable" });
    const { outcome } = await importRepository(prismaWith(gitlab()), subject, { slug: "acme", approval: null });
    expect(outcome).toEqual({ ok: false, error: "gitlab-project-disconnected" });
    expect(h.runFromReader).not.toHaveBeenCalled();
    // 건강성은 프로젝트가 참조하는 연결로 본다 — 호출자의 연결이 아니다.
    expect(h.health).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", target: expect.objectContaining({ host: "gitlab", connectionId: "owner-conn" }) }));
  });

  it("그 거부 문장은 재연결을 말하고 GitLab 연결 없음 하나로 단언하지 않는다", () => {
    expect(en.errors.gitlab["gitlab-project-disconnected"]).toMatch(/reconnect/i);
    expect(en.errors.gitlab["gitlab-project-disconnected"]).toMatch(/can.t be used/i);
  });

  it("건강성을 확인하지 못했으면(일시 장애) 끊김으로 접지 않고 실행한다", async () => {
    h.checkRepoAccess.mockResolvedValueOnce(callerOk);
    h.health.mockResolvedValueOnce({ status: "unknown" });
    h.runFromReader.mockResolvedValueOnce({ ok: true, surfaces: [], remainingEdits: 0 });
    const { outcome } = await importRepository(prismaWith(gitlab()), subject, { slug: "acme", approval: null });
    expect(outcome).toEqual({ ok: true, surfaces: [], remainingEdits: 0 });
    expect(h.runFromReader).toHaveBeenCalledOnce();
  });

  it("GitHub 프로젝트는 건강성을 따로 묻지 않는다 — 호출자 확인이 설치를 이미 본다", async () => {
    h.checkRepoAccess.mockResolvedValueOnce({ status: "ok", host: "github", repositoryId: "10", installationId: "1", repoOwner: "o", repoName: "r" });
    h.runFromReader.mockResolvedValueOnce({ ok: true, surfaces: [], remainingEdits: 0 });
    await importRepository(prismaWith(project()), subject, { slug: "acme", approval: null });
    expect(h.health).not.toHaveBeenCalled();
    expect(h.runFromReader).toHaveBeenCalledOnce();
  });
});
