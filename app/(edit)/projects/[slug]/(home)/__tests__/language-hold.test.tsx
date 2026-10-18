import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import type { SurfaceLocaleState } from "@/lib/locales/work";

/**
 * **Home이 언어 변경을 배선한다** (language-request-todo T6 · review-A Y1·Y2). 순수 판정(`planHomeHold`·`countCards`)은 각자 표 테스트가 있지만, 페이지가
 * `localeHeld: false`·`languageChanges: 0`을 넘기면 그 표는 green인 채 화면이 게이트와 다른 보류를 말한다. 그래서 페이지를 mock 의존성으로 불러 카드·메타 열이
 * 받는 props를 본다.
 *
 * - 전달 전 제거 → 첫 렌더의 `To send` 보조 줄이 보류 사유이고(늦은 갈래 없음), PR 조회가 0회이며, 메타 열 Sync 탭에 Hold 행이 서고 PR state는 `absent`다(D12).
 * - 셀 0 · 값 있는 추가만 → 보조 줄이 언어 변경 수다(`nothing to send`가 아니다).
 * - 보류 판정은 게이트를 `states`에 직접 부른다 — slug를 모르는 소스여도 보류다(`languageTodo`를 거치지 않는다).
 */
const state = vi.hoisted(() => ({
  openPr: vi.fn(async (): Promise<string | null | undefined> => null),
  localeWork: { work: 0, awaiting: false, states: [] as SurfaceLocaleState[] },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/" }));
vi.mock("@/lib/i18n/server", async () => ({
  getUiLocale: async () => "en",
  getDateStyle: async () => ({ uiLocale: "en", timeZone: "UTC" }),
  getMessages: async () => (await import("@/messages/en")).en,
}));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p", role: "OWNER", archived: false, userId: "u" }) }));
const SURFACE = { id: "s-web", slug: "web", archivedAt: null, lastCommitSha: "sha", lastCommitAt: null, lastImportedAt: new Date("2026-10-17T00:00:00Z"),
  lastImportError: null, lastImportStartedAt: null, lastImportFailedAt: null, locales: [] };
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({
  name: "Acme", image: null, repoHost: "github", installationId: "i", gitlabConnectionId: null, repositoryId: "r", repoOwner: "o", repoName: "r",
  baseBranch: "main", createdAt: new Date("2026-01-01T00:00:00Z"), archivedAt: null, pushTokenHash: null,
  defaultSurface: { slug: "web", archivedAt: null }, surfaces: [SURFACE], _count: { members: 1, invitations: 0 },
}) } }) }));
vi.mock("@/lib/events/query", () => ({ HOME_EVENT_LIMIT: 5, loadEvents: async () => ({ rows: [] }), loadEvent: async () => null }));
vi.mock("@/lib/repo-host", () => ({ loadConnectionHealth: async () => ({ status: "ok" }) }));
// 마지막 Publish가 PR을 냈다 — PR state 행의 자리가 생기는 장면이라, 보류 장면의 `absent`(행 없음)가 공허하지 않다.
vi.mock("@/lib/home/runs", () => ({ loadHomeRuns: async () => ({ sync: null, publish: {
  trigger: "manual", at: new Date("2026-10-16T00:00:00Z"), prUrl: "https://github.com/o/r/pull/7", changedValues: 3, surfaceSlugs: ["web"],
} }) }));
vi.mock("@/lib/home/write-lock", () => ({ loadWriteLock: async () => null }));
vi.mock("@/lib/keys/translation-list", () => ({ translationLinkFor: async () => null }));
vi.mock("@/lib/keys/query", () => ({
  loadActors: async () => new Map(),
  loadReviewAttention: async () => [],
  loadProjectListAggregates: async () => ({ locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map(),
    unsentAt: new Map(), newKeysBySurface: new Map(), unsentBySurface: new Map() }),
}));
vi.mock("@/lib/locales/work", () => ({ readLocaleWork: async () => state.localeWork }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrlMemo: state.openPr }));
// Home 머리의 클라이언트 조각이 Server Action 모듈을 문다 — 이 테스트는 렌더하지 않고 props만 본다.
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));

import Page from "../page";
import { CountCards } from "@/components/home/count-cards";
import { MetaColumn } from "@/components/home/meta-column";

/** 페이지가 돌려준 요소 트리에서 그 컴포넌트의 요소를 찾는다 — 렌더하지 않고 페이지가 넘긴 props를 본다. */
function find<P>(node: ReactNode, type: unknown): ReactElement<P> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find<P>(child, type);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<P>;
  return find<P>((node.props as { children?: ReactNode }).children, type);
}

async function home() {
  const tree = await Page({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve({}) });
  const cards = find<Parameters<typeof CountCards>[0]>(tree, CountCards);
  const meta = find<Parameters<typeof MetaColumn>[0]>(tree, MetaColumn);
  if (cards === null || meta === null) throw new Error("Home 트리에 카드·메타 열이 없다");
  const toSend = cards.props.cards.find(card => card.key === "toSend");
  return { toSend, heldLater: cards.props.heldLater, tabs: meta.props.tabs, late: meta.props.late };
}

const at = new Date("2026-10-18T00:00:00Z");
const removal: SurfaceLocaleState = {
  // slug를 모르는 소스 id다 — 보류 판정은 slug를 보지 않는다(review-A Y2).
  surfaceId: "s-unknown", rows: [{ localeCode: "ko", operation: "REMOVE", orphaned: false, requestedAt: at }], valueCounts: new Map(),
  current: [{ localeCode: "ko", effect: "delete" }], delivered: [], storedDelivered: [], work: [{ localeCode: "ko", current: "delete", delivered: null }],
};
const addition: SurfaceLocaleState = {
  surfaceId: "s-web", rows: [{ localeCode: "fr", operation: "ADD", orphaned: false, requestedAt: at }], valueCounts: new Map([["fr", 4]]),
  current: [{ localeCode: "fr", effect: "create" }], delivered: [], storedDelivered: [], work: [{ localeCode: "fr", current: "create", delivered: null }],
};

beforeEach(() => {
  state.openPr.mockClear();
  state.openPr.mockResolvedValue(null);
});

it("전달 전 제거 → 첫 렌더가 보류를 말하고 PR을 조회하지 않는다 · 메타 Hold · PR state absent", async () => {
  state.localeWork = { work: 1, awaiting: false, states: [removal] };
  const view = await home();
  expect(view.toSend?.subline).toEqual({ kind: "repositoryUpdatesPaused", reason: "locale-change-pending" });
  expect(view.heldLater).toBeUndefined();
  expect(view.late).toBeUndefined();
  expect(state.openPr).not.toHaveBeenCalled();
  expect(view.tabs.sync.flat()).toContainEqual({ kind: "hold", reason: "locale-change-pending" });
  // PR state `absent`(D12) — 미전달 편집 보류와 같이 PR을 보지 않았으므로 행이 없다.
  expect(view.tabs.publish.flat().some(row => row.kind === "prState")).toBe(false);
});

it("셀 0 · 값 있는 추가만 → 보조 줄이 언어 변경 수다 — PR 결론 전·후 모두 nothing to send가 아니다", async () => {
  state.localeWork = { work: 1, awaiting: false, states: [addition] };
  const view = await home();
  // PR 게이트가 서므로 PR 갈래는 늦게 오고, 그 전의 줄은 서버가 정한 기본 줄이다.
  expect(view.toSend?.subline).toEqual({ kind: "languageChanges", count: 1 });
  expect(view.heldLater).toBeInstanceOf(Promise);
  await expect(view.heldLater).resolves.toBeNull();
  expect(state.openPr).toHaveBeenCalledTimes(1);
  // 대조 — PR을 조회하는 갈래에서는 메타 열이 늦은 결론(Hold · PR state)을 받는다. 위 보류 장면의 `late` 없음이 공허하지 않다.
  expect(view.late).toBeInstanceOf(Promise);
  expect(view.tabs.publish.flat().some(row => row.kind === "prState")).toBe(true);
});

it("언어 변경이 없으면 기존대로 nothing to send다", async () => {
  state.localeWork = { work: 0, awaiting: false, states: [] };
  expect((await home()).toSend?.subline).toEqual({ kind: "nothingPending" });
});
