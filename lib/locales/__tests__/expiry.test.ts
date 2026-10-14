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

  // R-A1 Y2 — 로케일 파일 0개는 "비었다"는 증거가 아니다(POSTMORTEM 2026-09-15). strict 적재도 빈 목록을 받지 않는다.
  it("빈 관측은 만료하지 않고 보류한다 — 모순 행도", () => {
    expect(planLocaleExpiry(input({ observed: { status: "observed", locales: [] } }))).toEqual({ expired: [], held: "base-empty" });
    const rows = [{ localeCode: "fr", operation: "ADD" as const, orphaned: true }];
    expect(planLocaleExpiry(input({ rows, current: [created("fr")], delivered: [], observed: { status: "observed", locales: [] } })))
      .toEqual({ expired: [], held: "base-empty" });
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

describe("planLocaleExpiry — ADD rows need their own evidence (R-A1 R1·Y1)", () => {
  const fr = { localeCode: "fr", operation: "ADD" as const, orphaned: false };

  // 값 0개 ADD는 효과 목록에 없다 — 목록이 같다는 것만으로 만료하면 첫 값 저장 전의 적재가 방금 추가한 언어를 orphan시킨다.
  it("빈 ADD + 목록 일치 + PR 없음 → 보류", () => {
    expect(planLocaleExpiry(input({ rows: [fr], current: [], delivered: [] }))).toEqual({ expired: [], held: "undelivered" });
  });

  it("빈 ADD는 같은 소스의 전달된 REMOVE가 만료될 때 함께 쓸려 나가지 않는다", () => {
    const rows = [fr, { localeCode: "ko", operation: "REMOVE" as const, orphaned: false }];
    expect(planLocaleExpiry(input({ rows, current: [deleted("ko")], delivered: [deleted("ko")] }))).toEqual({
      expired: [{ localeCode: "ko", operation: "REMOVE", presence: "orphan" }],
      held: "undelivered",
    });
  });

  // 보류된 ADD(`proposal-path-exists`)는 전달 목록에 create가 없다 — 리포에 직접 생긴 파일을 관측하면 그대로 active로 푼다.
  it("보류된 ADD의 파일이 base에 나타나면 active로 만료한다", () => {
    const plan = planLocaleExpiry(input({ rows: [fr], current: [created("fr")], delivered: [], observed: { status: "observed", locales: ["en", "fr"] } }));
    expect(plan).toEqual({ expired: [{ localeCode: "fr", operation: "ADD", presence: "active" }], held: null });
  });

  it("확인 안 된 전달 목록이어도 파일이 관측된 ADD는 active로 만료한다", () => {
    const plan = planLocaleExpiry(input({ rows: [fr], current: [created("fr")], delivered: null, observed: { status: "observed", locales: ["en", "fr"] } }));
    expect(plan).toEqual({ expired: [{ localeCode: "fr", operation: "ADD", presence: "active" }], held: null });
  });

  it("전달된 ADD + PR이 머지 없이 닫힘 + 파일 없음 → orphan으로 만료한다", () => {
    const plan = planLocaleExpiry(input({ rows: [fr], current: [created("fr")], delivered: [created("fr")], observed: { status: "observed", locales: ["en"] } }));
    expect(plan).toEqual({ expired: [{ localeCode: "fr", operation: "ADD", presence: "orphan" }], held: null });
  });

  it.each<PullRequestCheck>(["open", "failed"])("파일이 관측돼도 PR 조회가 %s면 보류한다", pullRequest => {
    const plan = planLocaleExpiry(input({ pullRequest, rows: [fr], current: [created("fr")], delivered: [], observed: { status: "observed", locales: ["en", "fr"] } }));
    expect(plan.expired).toEqual([]);
  });

  it("관측된 ADD를 빼고 나머지 목록이 다르면 나머지는 보류한다", () => {
    const rows = [fr, { localeCode: "ko", operation: "REMOVE" as const, orphaned: false }];
    const plan = planLocaleExpiry(input({ rows, current: [created("fr"), deleted("ko")], delivered: [], observed: { status: "observed", locales: ["en", "fr", "ko"] } }));
    expect(plan).toEqual({ expired: [{ localeCode: "fr", operation: "ADD", presence: "active" }], held: "undelivered" });
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
