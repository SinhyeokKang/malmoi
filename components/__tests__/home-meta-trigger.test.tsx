// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { MetaColumn } from "@/components/home/meta-column";
import type { MetaRow } from "@/lib/home/meta";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

import { render } from "./helpers/dom";

/**
 * nightly-sync F2 — `Last sync`·`Last publish` 값이 주체를 붙인다(DESIGN §6.64의 ` · ` 연쇄). 순서는 시각 → 주체 → 실패 → 보류다.
 */
const now = new Date("2026-09-20T12:00:00Z");
const day = new Date("2026-09-19T12:00:00Z");
const tenMin = new Date("2026-09-20T11:50:00Z");

const valueOf = async (row: MetaRow) => {
  const { container } = await render(<MetaColumn slug="acme" now={now} canOpenSettings={false} rows={[row]} />);
  return container.querySelector("dd")?.textContent ?? "";
};

describe("메타 열 — 실행 주체", () => {
  it.each([
    ["manual", m.logs.meta.manual],
    ["nightly", m.logs.meta.nightly],
    ["ci", m.logs.meta.ci],
  ] as const)("Last sync에 %s가 붙는다", async (trigger, word) => {
    expect(await valueOf({ kind: "lastSync", at: day, failedAt: null, trigger, heldByOpenPr: false })).toBe(`${relativeTime(day, now)} · ${word}`);
  });

  it("주체가 없으면 시각만이다 — 이력 도입 전", async () => {
    expect(await valueOf({ kind: "lastSync", at: day, failedAt: null, trigger: null, heldByOpenPr: false })).toBe(relativeTime(day, now));
  });

  it("실패 행 순서는 시각 · 주체 · 실패다", async () => {
    expect(await valueOf({ kind: "lastSync", at: day, failedAt: tenMin, trigger: "nightly", heldByOpenPr: false }))
      .toBe(`${relativeTime(day, now)} · ${m.logs.meta.nightly} · ${m.home.meta.failedAt(relativeTime(tenMin, now))}`);
  });

  it("최근 적재가 open-pr 보류면 보류 한 줄이 붙는다", async () => {
    expect(await valueOf({ kind: "lastSync", at: day, failedAt: null, trigger: "ci", heldByOpenPr: true }))
      .toBe(`${relativeTime(day, now)} · ${m.logs.meta.ci} · ${m.home.meta.heldByOpenPr}`);
  });

  it("Never에는 주체가 붙지 않는다", async () => {
    expect(await valueOf({ kind: "lastSync", at: null, failedAt: null, trigger: "nightly", heldByOpenPr: false })).toBe(m.home.meta.never);
    expect(await valueOf({ kind: "lastPublish", at: null, prUrl: null, trigger: "nightly" })).toBe(m.home.meta.never);
  });

  it("Last publish — PR · 시각 · 주체, PR이 없으면 시각 · 주체", async () => {
    expect(await valueOf({ kind: "lastPublish", at: day, prUrl: "https://github.com/acme/web/pull/127", trigger: "nightly" }))
      .toBe(`${m.home.meta.pullRequest} ${m.home.meta.pr(127)} · ${relativeTime(day, now)} · ${m.logs.meta.nightly}`);
    expect(await valueOf({ kind: "lastPublish", at: day, prUrl: null, trigger: "manual" })).toBe(`${relativeTime(day, now)} · ${m.logs.meta.manual}`);
  });
});
