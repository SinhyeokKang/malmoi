// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CountCards } from "@/components/home/count-cards";
import { countCards } from "@/lib/home/cards";
import { en } from "@/messages/en";
import type { HoldReason } from "@/lib/protection/plan";

import { render } from "./helpers/dom";

/**
 * **`To send` 보조 줄의 보류 사유** (ux-drift-unify Q6 · T18) — 사유 셋이 각자 문장이고, PR 조회에 달린 사유는 **Suspense 뒤에서 늦게 도착한다**.
 * 도착 전에는 카드가 든 줄(`nothing to send` — 편집 0이라 참이다)이 서고, 나머지 카드·수치는 기다리지 않는다(malmoi#107이 줄인 착지 병목).
 */
const now = new Date("2026-09-20T12:00:00Z");
const input = (hold: HoldReason | null, toSend = 0, languageChanges = 0) => countCards({
  state: "default", counts: { newFromGithub: 1, toTranslate: 2, toReview: 0, toSend }, surfaces: 1, keys: 10,
  lastSyncAt: new Date("2026-09-19T12:00:00Z"), reviewByLocale: [], hold, languageChanges,
});
const toSend = async (cards: ReturnType<typeof countCards>, heldLater?: Promise<HoldReason | null>) => {
  const { container } = await render(<CountCards cards={cards} slug="acme" surfaceSlugs={{ newFromGithub: "web", toTranslate: "web", toReview: "web", toSend: "web" }} now={now} heldLater={heldLater} uiLocale="en" m={en} />);
  return container.querySelectorAll("li")[3]?.textContent ?? "";
};

describe("To send 보조 줄 — 보류 사유", () => {
  it.each(["pending-edits", "locale-change-pending", "open-pr", "pr-check-failed"] as const)("%s는 자기 문장이다", async (reason) => {
    expect(await toSend(input(reason, reason === "pending-edits" ? 3 : 0))).toContain(en.home.cards.held[reason]);
  });

  it("PR 조회를 기다리는 동안은 nothing to send이고, 도착하면 사유로 바뀐다", async () => {
    const pending = await toSend(input(null), new Promise(() => {}));
    expect(pending).toContain(en.home.cards.nothingPending);
    expect(await toSend(input(null), Promise.resolve("open-pr"))).toContain(en.home.cards.held["open-pr"]);
    expect(await toSend(input(null), Promise.resolve("pr-check-failed"))).toContain(en.home.cards.held["pr-check-failed"]);
    expect(await toSend(input(null), Promise.resolve(null))).toContain(en.home.cards.nothingPending);
  });

  it("늦게 도착하는 사유는 To send 카드만 바꾼다 — 다른 카드는 먼저 선다", async () => {
    const { container } = await render(<CountCards cards={input(null)} slug="acme" surfaceSlugs={{ newFromGithub: "web", toTranslate: "web", toReview: "web", toSend: "web" }} now={now} heldLater={new Promise(() => {})} uiLocale="en" m={en} />);
    expect(container.querySelectorAll("li")).toHaveLength(4);
    expect(container.querySelectorAll("li")[0]?.textContent).toContain(en.projects.summary.newFromGithub);
  });
});

/**
 * **셀 0 · 언어 변경만 남았으면 어느 렌더 경로에서도 `nothing to send`가 아니다** (language-request-todo spec 완료 조건 4 · design §5 R1).
 * 서버가 바로 정하는 줄(`sublineFor`)과 늦은 갈래(`HoldLater` — 도착 전 · 결론 `null`)가 같은 기본 줄을 쓴다. 보류 결론이 오면 사유가 이긴다.
 */
describe("To send 보조 줄 — 언어 변경", () => {
  const line = en.home.cards.languageChanges(3);

  it("서버가 바로 정한 줄", async () => {
    const text = await toSend(input(null, 0, 3));
    expect(text).toContain(`${en.home.cards.unit.cells} · ${line}`);
    expect(text).not.toContain(en.home.cards.nothingPending);
  });

  it("단수형", async () => {
    expect(await toSend(input(null, 0, 1))).toContain(en.home.cards.languageChanges(1));
    expect(en.home.cards.languageChanges(1)).toBe("1 language change to publish");
  });

  it.each([
    ["도착 전", new Promise<HoldReason | null>(() => {}), line],
    ["결론 null", Promise.resolve(null), line],
    ["결론 open-pr", Promise.resolve("open-pr" as const), en.home.cards.held["open-pr"]],
  ] as const)("늦은 갈래 %s", async (_label, heldLater, expected) => {
    const text = await toSend(input(null, 0, 3), heldLater);
    expect(text).toContain(expected);
    expect(text).not.toContain(en.home.cards.nothingPending);
  });

  it("전달 전 제거는 첫 렌더의 보류 사유다", async () => {
    expect(await toSend(input("locale-change-pending", 0, 2))).toContain(`${en.home.cards.unit.cells} · ${en.home.cards.held["locale-change-pending"]}`);
  });
});
