// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CountCards } from "@/components/home/count-cards";
import { countCards } from "@/lib/home/cards";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";

import { render } from "./helpers/dom";

/**
 * **`To send` 보조 줄의 보류 사유** (ux-drift-unify Q6 · T18) — 사유 셋이 각자 문장이고, PR 조회에 달린 사유는 **Suspense 뒤에서 늦게 도착한다**.
 * 도착 전에는 카드가 든 줄(`nothing to send` — 편집 0이라 참이다)이 서고, 나머지 카드·수치는 기다리지 않는다(malmoi#107이 줄인 착지 병목).
 */
const now = new Date("2026-09-20T12:00:00Z");
const input = (hold: HoldReason | null, toSend = 0) => countCards({
  state: "default", counts: { newFromGithub: 1, toTranslate: 2, toReview: 0, toSend }, surfaces: 1, keys: 10,
  lastSyncAt: new Date("2026-09-19T12:00:00Z"), reviewByLocale: [], hold,
});
const toSend = async (cards: ReturnType<typeof countCards>, heldLater?: Promise<HoldReason | null>) => {
  const { container } = await render(<CountCards cards={cards} slug="acme" surfaceSlug="web" now={now} heldLater={heldLater} />);
  return container.querySelectorAll("li")[3]?.textContent ?? "";
};

describe("To send 보조 줄 — 보류 사유", () => {
  it.each(["pending-edits", "open-pr", "pr-check-failed"] as const)("%s는 자기 문장이다", async (reason) => {
    expect(await toSend(input(reason, reason === "pending-edits" ? 3 : 0))).toContain(m.home.cards.held[reason]);
  });

  it("PR 조회를 기다리는 동안은 nothing to send이고, 도착하면 사유로 바뀐다", async () => {
    const pending = await toSend(input(null), new Promise(() => {}));
    expect(pending).toContain(m.home.cards.nothingPending);
    expect(await toSend(input(null), Promise.resolve("open-pr"))).toContain(m.home.cards.held["open-pr"]);
    expect(await toSend(input(null), Promise.resolve("pr-check-failed"))).toContain(m.home.cards.held["pr-check-failed"]);
    expect(await toSend(input(null), Promise.resolve(null))).toContain(m.home.cards.nothingPending);
  });

  it("늦게 도착하는 사유는 To send 카드만 바꾼다 — 다른 카드는 먼저 선다", async () => {
    const { container } = await render(<CountCards cards={input(null)} slug="acme" surfaceSlug="web" now={now} heldLater={new Promise(() => {})} />);
    expect(container.querySelectorAll("li")).toHaveLength(4);
    expect(container.querySelectorAll("li")[0]?.textContent).toContain(m.projects.summary.newFromGithub);
  });
});
