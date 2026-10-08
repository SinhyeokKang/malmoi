import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { InboxPlan } from "@/lib/inbox/plan";
import { en } from "@/messages/en";

import InboxLoading from "../loading";
import InboxPage from "../page";

/**
 * `/inbox` 서버 페이지의 배선 (inbox-page D1). 렌더(GET)는 아무것도 쓰지 않는다 — 읽음 기록은 마운트 뒤 `MarkSeen` 섬이 한다.
 * ⚠️ **`MarkSeen`에 넘기는 시각은 조회 전 서버 시각의 ISO 문자열이다** — `clampSeenAt`이 `toISOString()` 왕복만 받아 `Date`는 조용히 `invalid`가 된다.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), load: vi.fn(), db: vi.fn(), update: vi.fn(), mark: vi.fn(), markSeen: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.db }));
vi.mock("@/lib/inbox/load", () => ({ loadAttentionInbox: mocks.load }));
vi.mock("@/app/inbox/actions", () => ({ markAttentionSeenAction: mocks.mark }));
vi.mock("@/components/inbox/mark-seen", () => ({
  MarkSeen: (props: { at: unknown }) => { mocks.markSeen(props); return null; },
}));
vi.mock("@/lib/i18n/server", async () => {
  const { en } = await import("@/messages/en");
  return { getMessages: async () => en, getUiLocale: async () => "en" };
});

const before = new Date("2026-10-09T12:00:00.000Z");
const PLAN: InboxPlan = {
  unread: 1,
  groups: [
    { project: { slug: "storefront", name: "Storefront", image: null }, items: [
      { kind: "import_failed", at: new Date(before.getTime() - 12 * 60_000), surfaceSlug: "web", reason: "parse-failed", unread: true, ownerRetries: false },
    ] },
    { project: { slug: "mobile", name: "Mobile app", image: null }, items: [
      { kind: "unsent", at: null, count: 2, surfaceSlug: "app", unread: false, ownerRetries: false },
    ] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: before, toFake: ["Date"] });
  mocks.requireUser.mockResolvedValue({ userId: "u1" });
  mocks.db.mockReturnValue({ user: { updateMany: mocks.update } });
  mocks.load.mockResolvedValue(PLAN);
});
afterEach(() => { vi.useRealTimers(); });

it("인증이 거부되면 조회도 쓰기도 없다", async () => {
  mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(InboxPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});

it("세션 사용자로 조회하고, 조회 중 시계가 전진해도 MarkSeen에는 조회 전 ISO 시각 문자열이 간다", async () => {
  mocks.load.mockImplementation(async () => { vi.setSystemTime(new Date(before.getTime() + 5000)); return PLAN; });
  const html = renderToStaticMarkup(await InboxPage());
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith(mocks.db(), "u1");
  expect(mocks.markSeen).toHaveBeenCalledExactlyOnceWith({ at: before.toISOString() });
  expect(typeof mocks.markSeen.mock.calls[0]![0].at).toBe("string");
  expect(html).toContain(`>${en.common.nav.inbox}</h1>`);
});

it("렌더 중 읽음 Action도 DB 쓰기도 없다", async () => {
  renderToStaticMarkup(await InboxPage());
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("목록은 계획 그대로 프로젝트마다 카드 하나다", async () => {
  const html = renderToStaticMarkup(await InboxPage());
  expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(match => match[1]!.replace(/<[^>]+>/g, ""))).toEqual(["Storefront", "Mobile app"]);
});

it("조회 실패는 오류 경계로 전파하고 MarkSeen을 만들지 않는다", async () => {
  mocks.load.mockRejectedValue(new TypeError("db down"));
  await expect(InboxPage()).rejects.toThrow("db down");
  expect(mocks.markSeen).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});

it("골격은 낭독 한 줄과 카드·행 자리다", async () => {
  const html = renderToStaticMarkup(await InboxLoading());
  expect(html).toContain(`role="status">${en.inbox.loading}</span>`);
  expect((html.match(/<section/g) ?? []).length).toBe(2);
  expect((html.match(/<li/g) ?? []).length).toBeGreaterThan(0);
});
