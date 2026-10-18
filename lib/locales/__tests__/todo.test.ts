import { describe, expect, it } from "vitest";

import { planLocaleImportGate } from "@/lib/push/locale-gate";
import { languageTodo } from "../todo";
import type { LocaleEffect, LocaleOperation } from "../effects";
import type { SurfaceLocaleState } from "../work";
import { localeWork } from "../work";

/** `readLocaleStates`가 내는 모양을 손으로 만든다 — 작업은 실제 `localeWork`로 계산해 정의가 둘로 갈리지 않게 한다. */
function state(
  surfaceId: string,
  rows: { localeCode: string; operation: LocaleOperation; requestedAt: Date }[],
  current: LocaleEffect[],
  delivered: LocaleEffect[] | null,
): SurfaceLocaleState {
  return {
    surfaceId,
    rows: rows.map(row => ({ ...row, orphaned: false })),
    valueCounts: new Map(),
    current,
    delivered,
    storedDelivered: delivered,
    work: localeWork(current, delivered),
  };
}

const T1 = new Date("2026-10-01T00:00:00.000Z");
const T2 = new Date("2026-10-02T00:00:00.000Z");
const T3 = new Date("2026-10-03T00:00:00.000Z");
const slugs = new Map([["s-web", "web"], ["s-docs", "docs"], ["s-app", "app"]]);

describe("languageTodo — 언어 변경 작업의 할 일 재료", () => {
  it("작업이 0이면 null이다 — 행이 있어도 전달 목록과 같으면 할 일이 아니다", () => {
    const delivered = state("s-web", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], [{ localeCode: "fr", effect: "create" }]);
    expect(languageTodo([delivered], slugs)).toBeNull();
    expect(languageTodo([], slugs)).toBeNull();
  });

  it("값 0개 ADD는 효과가 없어 작업이 아니다", () => {
    const empty = state("s-web", [{ localeCode: "ja", operation: "ADD", requestedAt: T1 }], [], []);
    expect(languageTodo([empty], slugs)).toBeNull();
  });

  it("수는 소스별 작업 수의 합이다 — countLocaleWork와 같은 정의", () => {
    const web = state("s-web", [
      { localeCode: "fr", operation: "ADD", requestedAt: T1 },
      { localeCode: "ja", operation: "ADD", requestedAt: T2 },
    ], [{ localeCode: "fr", effect: "create" }, { localeCode: "ja", effect: "create" }], []);
    const docs = state("s-docs", [{ localeCode: "de", operation: "ADD", requestedAt: T1 }], [{ localeCode: "de", effect: "create" }], null);
    const todo = languageTodo([web, docs], slugs);
    expect(todo?.count).toBe(3);
    expect(todo?.count).toBe([web, docs].reduce((sum, s) => sum + s.work.length, 0));
  });

  it("held는 게이트 결과 그대로다 — 전달 전 제거가 있으면 true", () => {
    const removal = state("s-web", [{ localeCode: "ko", operation: "REMOVE", requestedAt: T1 }], [{ localeCode: "ko", effect: "delete" }], []);
    const add = state("s-docs", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    expect(languageTodo([removal, add], slugs)?.held).toBe(true);
    expect(languageTodo([add], slugs)?.held).toBe(false);
  });

  it("held = (planLocaleImportGate가 defer) — 입력 조합 전부에서 같다", () => {
    const effects: (LocaleEffect["effect"] | null)[] = [null, "create", "delete"];
    for (const current of effects) {
      for (const delivered of effects) {
        const rows = current === null ? [] : [{ localeCode: "ko", operation: (current === "delete" ? "REMOVE" : "ADD") as LocaleOperation, requestedAt: T1 }];
        const s = state("s-web", rows, current === null ? [] : [{ localeCode: "ko", effect: current }], delivered === null ? [] : [{ localeCode: "ko", effect: delivered }]);
        const todo = languageTodo([s], slugs);
        if (s.work.length === 0) expect(todo).toBeNull();
        else expect(todo?.held).toBe(planLocaleImportGate([s]).action === "defer");
      }
    }
  });

  it("전달 뒤 취소한 제거(거둘 것)는 보류가 아니다", () => {
    const retract = state("s-web", [], [], [{ localeCode: "ko", effect: "delete" }]);
    expect(languageTodo([retract], slugs)).toEqual({ count: 1, surfaceSlug: "web", at: null, held: false });
  });

  it("대표 소스는 작업이 있는 소스 가운데 slug가 가장 작은 것이다 — 작업 없는 소스는 고르지 않는다", () => {
    const idle = state("s-app", [{ localeCode: "fr", operation: "ADD", requestedAt: T3 }], [{ localeCode: "fr", effect: "create" }], [{ localeCode: "fr", effect: "create" }]);
    const web = state("s-web", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    const docs = state("s-docs", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    expect(languageTodo([idle, web, docs], slugs)?.surfaceSlug).toBe("docs");
  });

  it("slug는 코드 단위로 견준다 — 대문자가 소문자보다 앞이다", () => {
    const upper = state("s-up", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    const lower = state("s-low", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    expect(languageTodo([lower, upper], new Map([["s-up", "Web"], ["s-low", "api"]]))?.surfaceSlug).toBe("Web");
  });

  it("slug를 모르는 소스는 대표가 될 수 없고, 아는 소스가 없으면 항목을 세우지 않는다(unsent와 같다)", () => {
    const known = state("s-web", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    const unknown = state("s-gone", [{ localeCode: "fr", operation: "ADD", requestedAt: T1 }], [{ localeCode: "fr", effect: "create" }], []);
    expect(languageTodo([unknown, known], slugs)).toMatchObject({ count: 2, surfaceSlug: "web" });
    expect(languageTodo([unknown], slugs)).toBeNull();
  });

  it("at은 작업이 있는 코드의 요청 시각 가운데 가장 늦은 것이다 — 작업 없는 행의 시각은 쓰지 않는다", () => {
    const web = state("s-web", [
      { localeCode: "fr", operation: "ADD", requestedAt: T1 },
      { localeCode: "ja", operation: "ADD", requestedAt: T3 },
    ], [{ localeCode: "fr", effect: "create" }, { localeCode: "ja", effect: "create" }], [{ localeCode: "ja", effect: "create" }]);
    const docs = state("s-docs", [{ localeCode: "ko", operation: "REMOVE", requestedAt: T2 }], [{ localeCode: "ko", effect: "delete" }], []);
    expect(languageTodo([web, docs], slugs)?.at).toEqual(T2);
  });

  it("거둘 것만 남으면 요청 행이 없어 at이 null이다(D11)", () => {
    const retract = state("s-web", [], [], [{ localeCode: "fr", effect: "create" }]);
    const other = state("s-docs", [], [], [{ localeCode: "ko", effect: "delete" }]);
    expect(languageTodo([retract, other], slugs)?.at).toBeNull();
  });
});
