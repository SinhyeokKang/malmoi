// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { MetaColumn } from "@/components/home/meta-column";
import type { MetaRow } from "@/lib/home/meta";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";
import { relativeTime } from "@/lib/relative-time";
import { STATE } from "@/lib/status/canon";

import { render } from "./helpers/dom";

/**
 * nightly-sync F2 — `Last sync`·`Last publish` 값이 주체를 붙인다. ⚠️ **배지가 먼저다** (ux-drift-unify 4-Y19 — Logs 보조줄의 `[배지…] 사실`
 * 문법): `[Nightly sync] 1d ago`. 주체 낱말은 Logs의 실행 종류 배지(`m.logs.meta.runType`)와 같다 — 옛 소문자 `nightly`가 같은 Home의 Recent
 * logs `Nightly sync` 옆에 섰다. 상태 조각(실패·일부 반영·보류)도 색 글자가 아니라 배지다(4-W11). 아래 `valueOf`는 배지를 `[word]`로 적는다.
 */
const now = new Date("2026-09-20T12:00:00Z");
const day = new Date("2026-09-19T12:00:00Z");
const tenMin = new Date("2026-09-20T11:50:00Z");

const valueOf = async (row: MetaRow, heldLater?: Promise<HoldReason | null>) => {
  const { container } = await render(<MetaColumn slug="acme" now={now} canOpenSettings={false} rows={[row]} heldLater={heldLater} />);
  const dd = container.querySelector("dd");
  for (const badge of dd?.querySelectorAll(".rounded-full") ?? []) badge.textContent = `[${badge.textContent}]`;
  return dd?.textContent ?? "";
};
const sync = (over: Partial<Extract<MetaRow, { kind: "lastSync" }>>): MetaRow => ({ kind: "lastSync", at: day, failed: null, trigger: null, held: null, ...over });

describe("메타 열 — 실행 주체", () => {
  it.each([
    ["manual", m.logs.meta.runType.IMPORT.manual],
    ["nightly", m.logs.meta.runType.IMPORT.nightly],
    ["ci", m.logs.meta.runType.IMPORT.ci],
  ] as const)("Last sync 앞에 %s 배지가 선다", async (trigger, word) => {
    expect(await valueOf(sync({ trigger }))).toBe(`[${word}]${relativeTime(day, now)}`);
  });

  it("주체가 없으면 시각만이다 — 이력 도입 전", async () => {
    expect(await valueOf(sync({}))).toBe(relativeTime(day, now));
  });

  it("실패 행 순서는 주체 · 시각 · 실패 배지 · 실패 시각이다", async () => {
    expect(await valueOf(sync({ failed: { at: tenMin, state: "syncFailed" }, trigger: "nightly" })))
      .toBe(`[${m.logs.meta.runType.IMPORT.nightly}]${relativeTime(day, now)}· [${STATE.syncFailed.label}]${relativeTime(tenMin, now)}`);
  });

  /** 🔴 A2 — 일부 반영은 데이터가 들어간 적재다. "failed"를 말하지 않는다. */
  it("일부 반영은 Partially synced 배지이고 failed가 없다", async () => {
    const text = await valueOf(sync({ failed: { at: tenMin, state: "partiallySynced" } }));
    expect(text).toContain(`[${STATE.partiallySynced.label}]`);
    expect(text).not.toMatch(/fail/i);
  });

  /** 보류는 사유가 셋이어도 배지 하나다 — 사유 문장은 To send 카드 보조 줄이 든다(DESIGN §6.64). 옛 판은 `open-pr`만 그렸다. */
  it.each(["pending-edits", "open-pr", "pr-check-failed"] as const)("보류(%s)면 Held 배지가 붙는다", async (held) => {
    expect(await valueOf(sync({ trigger: "ci", held })))
      .toBe(`[${m.logs.meta.runType.IMPORT.ci}]${relativeTime(day, now)}· [${STATE.held.label}]`);
  });

  /** PR 조회에 달린 보류는 늦게 도착한다 — 도착 전에는 아무것도 붙지 않고 본문은 먼저 선다(ux-drift-unify Q6). */
  it("늦게 도착한 보류 사유는 Suspense 뒤에서 선다", async () => {
    expect(await valueOf(sync({}), new Promise(() => {}))).toBe(relativeTime(day, now));
    expect(await valueOf(sync({}), Promise.resolve("open-pr"))).toBe(`${relativeTime(day, now)}· [${STATE.held.label}]`);
    expect(await valueOf(sync({}), Promise.resolve(null))).toBe(relativeTime(day, now));
  });

  /** 닫아도 풀린다 — Logs 사유 문장("merged or closed")과 같은 조건을 말한다. */
  it("PR 보류 사유는 머지와 닫기 둘 다를 푸는 조건으로 말한다", () => {
    expect(m.home.cards.held["open-pr"]).toContain("merged or closed");
    expect(m.logs.deferReasons["open-pr"]).toContain("merged or closed");
  });

  /** PR 조회 실패도 보류다(게이트 fail-closed) — 목적어를 붙인다(홀로 서는 "Couldn't check"는 연결 확인 실패 낱말이다). */
  it("PR 조회 실패 사유는 Couldn't check for an open pull request다", () => {
    expect(m.home.cards.held["pr-check-failed"].toLowerCase()).toContain("couldn't check for an open pull request");
  });

  it("Not synced yet에는 주체도 보류도 붙지 않는다", async () => {
    // 첫 동기화 전은 Sync 행만 "Not synced yet"이다(1-Y17) — Publish 행에 그 말을 쓰면 거짓이다(fix1 🔴1).
    expect(await valueOf(sync({ at: null, trigger: "nightly" }))).toBe(m.home.meta.notSyncedYet);
    expect(await valueOf({ kind: "lastPublish", at: null, prUrl: null, trigger: "nightly" })).toBe(m.home.meta.never);
    expect(await valueOf({ kind: "lastPublish", at: null, prUrl: null, trigger: "nightly" })).not.toMatch(/synced/i);
    expect(await valueOf(sync({ at: null, held: "open-pr" }))).toBe(m.home.meta.notSyncedYet);
  });

  it("Last publish — PR · 주체 · 시각, PR이 없으면 주체 · 시각", async () => {
    expect(await valueOf({ kind: "lastPublish", at: day, prUrl: "https://github.com/acme/web/pull/127", trigger: "nightly" }))
      .toBe(`${m.home.meta.pullRequest} ${m.home.meta.pr(127)} · [${m.logs.meta.runType.PUBLISH.nightly}]${relativeTime(day, now)}`);
    expect(await valueOf({ kind: "lastPublish", at: day, prUrl: null, trigger: "manual" })).toBe(`[${m.logs.meta.runType.PUBLISH.manual}]${relativeTime(day, now)}`);
  });
});
