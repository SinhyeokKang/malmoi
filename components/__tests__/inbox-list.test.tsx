// @vitest-environment jsdom
import { expect, it } from "vitest";

import { InboxList } from "@/components/inbox/inbox-list";
import { attentionHref } from "@/lib/home/attention-view";
import type { InboxPlan } from "@/lib/inbox/plan";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * `/inbox` 목록 (inbox-page D3·D4) — 프로젝트마다 `Card` 하나(머리 = 썸네일 + 이름), 행은 드롭다운·Home과 같은 공유 조각의 긴 시각 형이다.
 */
const now = new Date("2026-10-09T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const PLAN: InboxPlan = {
  unread: 2,
  groups: [
    { project: { slug: "storefront", name: "Storefront", image: null }, items: [
      { kind: "import_failed", at: ago(12), surfaceSlug: "web", reason: "parse-failed", unread: true, ownerRetries: false },
      { kind: "review", at: ago(180), surfaceSlug: "web", code: "ko", name: "Korean", count: 8, who: "Kim", unread: false, ownerRetries: false },
    ] },
    { project: { slug: "mobile", name: "Mobile app", image: null }, items: [
      { kind: "import_failed", at: ago(20), surfaceSlug: "app", reason: "partial-import", unread: true, ownerRetries: true },
      { kind: "unsent", at: null, count: 3, surfaceSlug: "app", unread: false, ownerRetries: false },
    ] },
  ],
};

it("카드·행 순서가 계획 그대로이고 카드 머리는 썸네일 + 이름이다", async () => {
  const { container } = await render(<InboxList plan={PLAN} now={now} m={en} uiLocale="en" />);
  const cards = [...container.querySelectorAll("section")];
  expect(cards.map(card => card.querySelector("h2")?.textContent)).toEqual(["Storefront", "Mobile app"]);
  for (const card of cards) expect(card.querySelector("h2 .size-4.rounded")).not.toBeNull();
  const links = cards.map(card => [...card.querySelectorAll("a")].map(a => a.getAttribute("href")));
  expect(links).toEqual(PLAN.groups.map(group => group.items.map(item => attentionHref(group.project.slug, item))));
});

it("행은 긴 시각 형 · 안 읽음 점과 sr 낱말 · EDITOR 실패 안내 · 시각 없는 항목은 aside 없음", async () => {
  const { container } = await render(<InboxList plan={PLAN} now={now} m={en} uiLocale="en" />);
  const rows = [...container.querySelectorAll("a")];
  expect(rows[0]!.textContent).toContain("12 minutes ago");
  expect(rows[0]!.textContent).not.toContain("12m ago");
  expect(rows.map(row => row.querySelectorAll("[data-unread-dot]").length)).toEqual([1, 0, 1, 0]);
  expect(rows[0]!.textContent!.startsWith(en.inbox.unread)).toBe(true);
  expect(rows.map(row => row.textContent!.includes(en.projects.importFailure.ownerRetries))).toEqual([false, false, true, false]);
  expect(rows[3]!.textContent).not.toMatch(/ago|Never/);
  // 점이 `absolute`라 그릇이 `relative`다 — Home 카드 행과 같은 형(chevron · 글자 크기 · 행 사이 선)이다.
  for (const row of rows) for (const token of ["relative", "border-border", "border-t", "text-base"]) expect(row.classList, token).toContain(token);
  expect(rows.every(row => row.querySelector("svg.lucide-chevron-right") !== null)).toBe(true);
});

it("빈 목록이면 카드 없이 빈 상태 하나 — Home 제목과 Inbox 보조 문장", async () => {
  const { container } = await render(<InboxList plan={{ groups: [], unread: 0 }} now={now} m={en} uiLocale="en" />);
  expect(container.querySelector("section")).toBeNull();
  expect(container.textContent).toContain(en.home.attention.empty.title);
  expect(container.textContent).toContain(en.inbox.emptyDescription);
  // `placement="card"` — 테두리 있는 카드 형이다(드롭다운의 `inset`과 다르다).
  expect(container.querySelector(".rounded-lg.border.py-12")).not.toBeNull();
});
