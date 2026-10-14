import { describe, expect, it } from "vitest";

import type { LocaleEffect } from "../effects";
import { planLocaleExpiry, type ExpiryInput, type PullRequestCheck } from "../expiry";

const created = (localeCode: string): LocaleEffect => ({ localeCode, effect: "create" });
const deleted = (localeCode: string): LocaleEffect => ({ localeCode, effect: "delete" });

function input(overrides: Partial<ExpiryInput> = {}): ExpiryInput {
  return {
    pullRequest: "none-open",
    current: [deleted("ko")],
    delivered: [deleted("ko")],
    rows: [{ localeCode: "ko", operation: "REMOVE", orphaned: false }],
    observed: { status: "observed", locales: ["en"] },
    ...overrides,
  };
}

describe("planLocaleExpiry — PR × list × file", () => {
  const prs: PullRequestCheck[] = ["none-open", "open", "failed"];
  const lists = [["same", [deleted("ko")]], ["different", []]] as const;
  const files = [["present", ["en", "ko"]], ["absent", ["en"]]] as const;

  for (const pr of prs) for (const [listLabel, delivered] of lists) for (const [fileLabel, locales] of files) {
    const expires = pr === "none-open" && listLabel === "same";
    it(`PR ${pr} · list ${listLabel} · file ${fileLabel} → ${expires ? "expire" : "hold"}`, () => {
      const plan = planLocaleExpiry(input({ pullRequest: pr, delivered: [...delivered], observed: { status: "observed", locales: [...locales] } }));
      if (expires) {
        expect(plan).toEqual({
          expired: [{ localeCode: "ko", operation: "REMOVE", presence: fileLabel === "present" ? "active" : "orphan" }],
          held: null,
        });
      } else {
        expect(plan.expired).toEqual([]);
        expect(plan.held).toBe(pr === "open" ? "pr-open" : pr === "failed" ? "pr-check-failed" : "undelivered");
      }
    });
  }

  // 수락 기준 13 — 머지 없이 닫힌 제거: 파일이 base에 남아 있으면 활성으로 돌아온다.
  it("an unmerged closed removal with the file still in base comes back active", () => {
    expect(planLocaleExpiry(input({ observed: { status: "observed", locales: ["en", "ko"] } })).expired)
      .toEqual([{ localeCode: "ko", operation: "REMOVE", presence: "active" }]);
  });

  it("a merged addition becomes active, an unmerged one orphan", () => {
    const value = input({ current: [created("fr")], delivered: [created("fr")], rows: [{ localeCode: "fr", operation: "ADD", orphaned: false }] });
    expect(planLocaleExpiry({ ...value, observed: { status: "observed", locales: ["en", "fr"] } }).expired)
      .toEqual([{ localeCode: "fr", operation: "ADD", presence: "active" }]);
    expect(planLocaleExpiry({ ...value, observed: { status: "observed", locales: ["en"] } }).expired)
      .toEqual([{ localeCode: "fr", operation: "ADD", presence: "orphan" }]);
  });

  it("an unconfirmed delivery list never expires", () => {
    expect(planLocaleExpiry(input({ delivered: null }))).toEqual({ expired: [], held: "undelivered" });
  });

  // POSTMORTEM 2026-09-27 — 못 읽은 base는 파일 부재가 아니다.
  it("an unreadable base never expires, not even contradictory rows", () => {
    const rows = [{ localeCode: "ko", operation: "REMOVE" as const, orphaned: false }, { localeCode: "fr", operation: "ADD" as const, orphaned: true }];
    expect(planLocaleExpiry(input({ rows, observed: { status: "unreadable" } }))).toEqual({ expired: [], held: "base-unreadable" });
  });

  it("an empty observation leaves presence unchanged, like the strict import", () => {
    expect(planLocaleExpiry(input({ observed: { status: "observed", locales: [] } })).expired)
      .toEqual([{ localeCode: "ko", operation: "REMOVE", presence: "unchanged" }]);
  });

  it("returns nothing for a source without rows", () => {
    expect(planLocaleExpiry(input({ rows: [], current: [], delivered: [] }))).toEqual({ expired: [], held: null });
  });

  it("expires every row together and sorts them", () => {
    const rows = [
      { localeCode: "zh_TW", operation: "ADD" as const, orphaned: false },
      { localeCode: "de", operation: "REMOVE" as const, orphaned: false },
    ];
    const plan = planLocaleExpiry(input({ rows, current: [deleted("de"), created("zh_TW")], delivered: [created("zh_TW"), deleted("de")], observed: { status: "observed", locales: ["en", "zh_TW"] } }));
    expect(plan).toEqual({
      expired: [
        { localeCode: "de", operation: "REMOVE", presence: "orphan" },
        { localeCode: "zh_TW", operation: "ADD", presence: "active" },
      ],
      held: null,
    });
  });

  it("handles __proto__ codes", () => {
    const value = input({ rows: [{ localeCode: "__proto__", operation: "REMOVE", orphaned: false }], current: [deleted("__proto__")], delivered: [deleted("__proto__")] });
    expect(planLocaleExpiry(value).expired).toEqual([{ localeCode: "__proto__", operation: "REMOVE", presence: "orphan" }]);
  });
});

describe("planLocaleExpiry — contradictory rows (rollback residue)", () => {
  // design §7 — 구버전이 orphan시킨 로케일에 ADD 행이 남는다. PR·목록과 무관하게 만료한다.
  const contradictory = { localeCode: "fr", operation: "ADD" as const, orphaned: true };

  it.each<PullRequestCheck>(["none-open", "open", "failed"])("an orphan with an ADD row expires even when the PR check is %s", pullRequest => {
    const plan = planLocaleExpiry(input({ pullRequest, rows: [contradictory], current: [created("fr")], delivered: [] }));
    expect(plan.expired).toEqual([{ localeCode: "fr", operation: "ADD", presence: "orphan" }]);
  });

  it("follows the base when the file exists", () => {
    const plan = planLocaleExpiry(input({ rows: [contradictory], current: [created("fr")], delivered: [], observed: { status: "observed", locales: ["en", "fr"] } }));
    expect(plan.expired).toEqual([{ localeCode: "fr", operation: "ADD", presence: "active" }]);
  });

  it("expires the contradiction alone while holding the other rows", () => {
    const rows = [contradictory, { localeCode: "ko", operation: "REMOVE" as const, orphaned: false }];
    const plan = planLocaleExpiry(input({ pullRequest: "open", rows, current: [created("fr"), deleted("ko")], delivered: [deleted("ko")] }));
    expect(plan).toEqual({ expired: [{ localeCode: "fr", operation: "ADD", presence: "orphan" }], held: "pr-open" });
  });
});
