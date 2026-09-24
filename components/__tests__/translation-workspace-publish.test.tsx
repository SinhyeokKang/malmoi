// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **미저장 가로채기는 Publish 버튼 하나에만 건다** (translation-rework C4 code-review 🟡). `PublishButton`은 직전 결과를 다시 여는
 * `View result`를 같은 컨테이너에 든다 — 컨테이너째 가로채면 결과를 보려는 클릭이 "Publish without saving…"으로 바뀐다.
 * ⚠️ `PublishButton`을 버튼 둘로 바꿔 가로채기 범위만 잰다 — 실제 Publish 흐름은 `publish-button.test.tsx`가 든다.
 */
const mocks = vi.hoisted(() => ({ launch: vi.fn(), showResult: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));
vi.mock("@/components/publish-button", () => ({
  usePublish: () => ({ pending: false, launch: mocks.launch, showResult: mocks.showResult }),
  PublishButton: ({ id }: { id?: string }) => (
    <div>
      <button id={id} type="button" onClick={() => mocks.launch()}>Publish</button>
      <button type="button" onClick={() => mocks.showResult()}>View result</button>
    </div>
  ),
  PublishModal: () => null,
}));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

it("미저장이 있어도 View result는 결과를 연다 — 확인창은 Publish 버튼에만 선다", async () => {
  const user = userEvent.setup();
  window.sessionStorage.clear();
  const { container } = await render(
    <TranslationWorkspace
      slug="acme" routeSurfaceSlug="web" role="OWNER" userId="u1"
      query={{ ...DEFAULT_TRANSLATION_QUERY, key: "k1", keySurface: "web" }}
      tree={{ projectKeyCount: 1, surfaces: [{ id: "s1", slug: "web", baseLocale: "en", locales: ["en", "zh"], keyCount: 1, namespaces: [] }] }}
      list={{ rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, nextCursor: null, effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult: true }}
      detail={{
        key: { id: "k1", key: "k", namespace: "common", sourceText: "Hi", description: null, surfaceSlug: "web" },
        refs: [],
        locales: [{ code: "en", isBase: true, value: "Hi", needsReview: false, pending: false, actorLabel: null }, { code: "zh", isBase: false, value: null, needsReview: false, pending: false, actorLabel: null }],
      }}
      unpublished={0}
      publish={{ repo: { owner: "o", name: "r", branch: "main", syncBranch: "s" }, lastSentLabel: null, lastPrUrl: null }}
      sync={{ name: "acme", branch: "main" }}
      baseLocale="en" declaredBaseLocale={null}
    />,
  );
  await user.type(container.querySelector<HTMLTextAreaElement>('textarea[data-locale="zh"]')!, "空");
  await user.click([...document.querySelectorAll("button")].find(b => b.textContent === "View result")!);
  expect(mocks.showResult).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("Publish without saving your changes?");
  await user.click([...document.querySelectorAll("button")].find(b => b.textContent === "Publish")!);
  expect(mocks.launch).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Publish without saving your changes?");
});
