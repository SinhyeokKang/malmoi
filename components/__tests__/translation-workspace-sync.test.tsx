// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 화면의 [Sync]도 결과를 보인다** (audit #5 — POSTMORTEM 2026-09-08 재발). 전엔 `onResult`가 결과를 버리고
 * 무조건 `router.refresh()`만 불러, 거부(`already-running`·`reconfirm`…)가 설명 없이 버튼만 복귀했고 세션이 끊긴
 * 거부에서는 refresh가 로그인 이동이 되어 거부 문구조차 사라졌다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { m } from "@/lib/i18n";

import { props } from "./helpers/workspace-props";

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
}
async function sync() {
  const user = userEvent.setup();
  await act(async () => user.click(button("Sync")));
  await act(async () => user.click(button("Discard changes and sync")));
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 1 });
});

it.each(["already-running", "reconfirm", "unauthorized"] as const)("거부(%s)는 번역 화면에 사유를 세우고 refresh하지 않는다", async (error) => {
  mocks.run.mockResolvedValue({ ok: false, error });
  await render(<TranslationWorkspace {...props()} />);
  await sync();
  expect(mocks.run).toHaveBeenCalledOnce();
  const status = [...document.querySelectorAll('[role="status"], [role="alert"]')].map(node => node.textContent ?? "").join(" ");
  // ⚠️ 세션 만료도 Sync 문장이다 (QA D2) — 공용 접근 문장("save your work")을 빌리지 않는다.
  const expected = m.repositorySync.errors[error];
  expect(status).toContain(expected);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

// 성공에도 refresh하지 않는다 (audit-ux #12) — `runRepositoryImport`의 `revalidatePath`가 새 트리를 싣고 온다. 짝은 결과 한 줄이다.
it("성공은 결과 한 줄을 세우고 refresh하지 않는다 — 짝 단언", async () => {
  mocks.run.mockResolvedValue({ ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "imported", count: 3, failed: 0, reason: null, errors: [] }] });
  await render(<TranslationWorkspace {...props()} />);
  await sync();
  expect(document.querySelector('[role="status"]')?.textContent).toContain("from main");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
