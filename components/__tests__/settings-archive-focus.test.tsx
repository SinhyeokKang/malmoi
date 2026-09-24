// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "./helpers/dom";

/**
 * **Settings의 보관↔복원 성공 뒤 포커스가 새 버튼에 선다** (malmoi#82). 페이지가 같은 보관 카드를 **두 자리**(General 위 ·
 * CI 아래)에 그려서, 전환이 `ArchiveCard`를 **언마운트**하고 새 인스턴스를 세운다 — 기다리던 착지(`useLandAfter`)가 옛
 * 인스턴스와 함께 사라져 포커스가 `body`에 남았다. 카드를 제자리에서 다시 그리는 테스트는 그 재마운트를 못 본다 — 그래서
 * **실제 페이지 조립**을 두 상태로 그려 잰다.
 */
const state = vi.hoisted(() => ({ archived: false, find: vi.fn(), archive: vi.fn(), unarchive: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p1", userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: state.find } }) }));
vi.mock("@/lib/github", () => ({ loadConnectionHealth: async () => ({ status: "ok" }) }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: async () => ({ status: "ok", login: "owner" }) }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: async () => null }));
vi.mock("@/lib/keys/query", () => ({ loadSurfaceCounts: async () => [] }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: vi.fn(), addSurfaces: vi.fn(), detectRepoFormats: vi.fn(), confirmManualFormat: vi.fn(), loadCandidateSample: vi.fn(), listRepoBranches: vi.fn(async () => ({ ok: true, names: ["main"], defaultBranch: "main", truncated: false })), rotatePushToken: vi.fn(), archiveProject: state.archive, unarchiveProject: state.unarchive }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn(), connectRepository: vi.fn(), updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
import SettingsPage from "@/app/(edit)/projects/[slug]/settings/page";
import { m } from "@/lib/i18n";

let fixup: MutationObserver | undefined;
beforeEach(() => {
  state.archived = false;
  state.find.mockImplementation(async () => ({ name: "Acme", image: null, repoOwner: "owner", repoName: "repo", installationId: "1", repositoryId: "r1", baseBranch: "main", archivedAt: state.archived ? new Date("2026-09-20") : null, surfaces: [] }));
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => { fixup?.disconnect(); });
const page = () => SettingsPage({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve({}) });
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter(b => b.textContent?.trim() === label).at(-1)!;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

it("보관이 성공하면 맨 위로 옮겨 선 [Restore project]로, 복원이 성공하면 맨 아래 [Archive project]로 착지한다", async () => {
  const user = userEvent.setup();
  const archived = deferred<{ ok: true }>();
  state.archive.mockReturnValue(archived.promise);
  const view = await render(await page());
  await act(async () => user.click(button(m.archive.action)));
  await act(async () => user.click(button(m.archive.action)));
  // revalidate가 실린 커밋 — 서버가 보관 상태로 다시 그린 페이지가 응답과 함께 온다.
  state.archived = true;
  const next = await page();
  await act(async () => { archived.resolve({ ok: true }); await view.rerender(next); });
  expect(document.activeElement).toBe(button(m.archive.restore));

  const restored = deferred<{ ok: true }>();
  state.unarchive.mockReturnValue(restored.promise);
  await act(async () => user.click(button(m.archive.restore)));
  state.archived = false;
  const back = await page();
  await act(async () => { restored.resolve({ ok: true }); await view.rerender(back); });
  expect(document.activeElement).toBe(button(m.archive.action));
});
