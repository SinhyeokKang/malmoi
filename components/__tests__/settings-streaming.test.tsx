// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { AccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { render } from "./helpers/dom";

/**
 * **설정 화면이 GitHub을 기다리지 않고 선다** (audit-ux #8). 연결 확인(`probeRepo` — 설치 조회·토큰·리포 조회)과
 * 열린 PR 조회가 페이지의 임계 경로에 있어, GitHub이 느린 날엔 이름·CI·보관 카드까지 통째로 그만큼 늦었다.
 * 이제 그 둘을 쓰는 자리만 Suspense 뒤에서 스트리밍된다.
 *
 * ⚠️ "기다리지 않는다"만 재면 공회전한다 — 같은 픽스처에서 **도착한 뒤 실물이 선다**를 짝으로 잰다
 * (POSTMORTEM 2026-09-14).
 */
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const state = vi.hoisted(() => ({
  health: undefined as unknown as Promise<ConnectionHealth>,
  account: undefined as unknown as Promise<AccountView>,
  pr: undefined as unknown as Promise<string | null | undefined>,
}));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p1", userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({ name: "Acme", image: null, repoOwner: "owner", repoName: "repo", installationId: "1", repositoryId: "r1", baseBranch: "main", archivedAt: null, surfaces: [] }) } }) }));
vi.mock("@/lib/github", () => ({ loadConnectionHealth: () => state.health }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: () => state.account }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: () => state.pr }));
vi.mock("@/app/(edit)/projects/actions", () => ({ listRepoBranches: vi.fn(async () => ({ ok: true, names: ["main"], defaultBranch: "main", truncated: false })), rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn(), connectRepository: vi.fn(), updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
import SettingsPage from "@/app/(edit)/projects/[slug]/settings/page";

let health: ReturnType<typeof deferred<ConnectionHealth>>;
let account: ReturnType<typeof deferred<AccountView>>;
let pr: ReturnType<typeof deferred<string | null | undefined>>;
beforeEach(() => {
  health = deferred(); account = deferred(); pr = deferred();
  state.health = health.promise; state.account = account.promise; state.pr = pr.promise;
});

const page = () => SettingsPage({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve({}) });
const section = (title: string) => [...document.querySelectorAll("section")].find(s => s.querySelector("header h2")?.textContent === title);

it("GitHub이 답하기 전에 카드 넷이 서고, 연결 행만 골격이다 — 도착하면 실물로 바뀐다", async () => {
  // 페이지가 GitHub을 await하면 여기서 매달린다 — 마감(8초) 전에 끝나야 한다.
  const tree = await Promise.race([page(), new Promise<"hung">(r => setTimeout(() => r("hung"), 200))]);
  expect(tree).not.toBe("hung");
  if (tree === "hung") return;
  await render(tree);

  expect([...document.querySelectorAll("section > header h2")].map(n => n.textContent)).toEqual(["General", "Repository", "CI integration", "Archive project"]);
  const repository = section("Repository")!;
  // 기준 브랜치 폼은 DB 값만으로 선다 — 골격 밖이다.
  expect(repository.querySelector("#base-branch, [aria-labelledby], button")).not.toBeNull();
  expect(repository.querySelector('[data-connection-pending]')).not.toBeNull();
  expect(repository.textContent).not.toContain("owner/repo");

  await act(async () => { health.resolve({ status: "ok" }); account.resolve({ status: "ok", login: "owner" }); });
  expect(repository.querySelector('[data-connection-pending]')).toBeNull();
  expect(repository.textContent).toContain("owner/repo");
  expect(repository.querySelector('a[href="https://github.com/owner/repo"]')).not.toBeNull();
});

it("열린 PR 조회가 안 끝나도 [Archive project]를 누를 수 있고, 도착하면 Dialog가 PR을 말한다", async () => {
  await render(await page());
  const archive = [...section("Archive project")!.querySelectorAll("button")].find(b => b.textContent === "Archive project")!;
  await act(async () => userEvent.setup().click(archive));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('a[href*="/pull/"]')).toBeNull();
  await act(async () => { pr.resolve("https://github.com/owner/repo/pull/3"); });
  expect(dialog.querySelector('a[href="https://github.com/owner/repo/pull/3"]')).not.toBeNull();
});
