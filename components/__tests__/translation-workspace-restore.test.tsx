// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **복구 두 갈래를 가른다** (malmoi#100). 다시 로그인한 뒤 탭을 연 복구(마운트 때의 사본)만 세션 문구를 쓴다. 같은 화면에서
 * 보호 없이 교체된 키로 돌아올 때의 복구(audit-ux U1 r1 backstop)는 미저장 수가 이미 말하므로 따로 한 줄을 세우지 않는다.
 * ⚠️ 복구 문구는 그것이 말하는 미저장보다 오래 살지 않는다 — 전엔 되돌려 0이 되는 순간 *"Signed back in · 1 … restored"* 가 떴다.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import { m } from "@/lib/i18n";

import { props } from "./helpers/workspace-props";

const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;
const footer = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-footer-result]")?.textContent ?? "";
const SESSION = m.translations.workspace.footer.session.restored(1);

function detailOf(keyId: string): NonNullable<WorkspaceProps["detail"]> {
  const base = props().detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>;
  return { ...base, key: { ...base.key, id: keyId, key: `common.${keyId}` }, locales: base.locales.map(l => ({ ...l })) };
}

beforeEach(() => window.sessionStorage.clear());

it("다시 로그인한 뒤 연 탭의 복구는 세션 문구를 세우고, 되돌려 0이 되면 푸터가 비어 있다", async () => {
  const user = userEvent.setup();
  window.sessionStorage.setItem("malmoi.translation-draft.u1.acme", JSON.stringify({
    surfaceSlug: "web", keyId: "k1", saved: { en: "Nothing here", ko: "비어 있음", zh: "" }, draft: { en: "Nothing here", ko: "비어 있음", zh: "空" },
  }));
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect(area(container, "zh").value).toBe("空");
  expect(footer(container)).toBe(SESSION);
  await user.clear(area(container, "zh"));
  expect(footer(container)).toBe("");
  // 다시 쳐도 옛 복구 문구가 살아나지 않는다 — 이제 그것은 새 입력이다.
  await user.type(area(container, "zh"), "空");
  expect(footer(container)).not.toContain("Signed back in");
  expect(footer(container)).toContain("1 unsaved change");
});

it("같은 화면에서 보호 없이 교체된 키로 돌아온 복구는 세션 문구를 쓰지 않는다 — 되돌리면 푸터가 비어 있다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, key: "k2" }} detail={detailOf("k2")} />);
  await rerender(<TranslationWorkspace {...initial} detail={detailOf("k1")} />);
  expect(area(container, "zh").value).toBe("空");
  expect(footer(container)).toContain("1 unsaved change");
  expect(footer(container)).not.toContain("Signed back in");
  await user.clear(area(container, "zh"));
  expect(footer(container)).toBe("");
});
