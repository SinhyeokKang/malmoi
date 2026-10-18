import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { deliveredForRequests, deliveredOf, foldLocaleStates, localeWork, parseDeliveredLocaleChanges, readLocaleStatesByProject } from "../work";

describe("parseDeliveredLocaleChanges", () => {
  it("NULL·빈 배열은 전달한 것이 없다", () => {
    expect(parseDeliveredLocaleChanges(null)).toEqual([]);
    expect(parseDeliveredLocaleChanges([])).toEqual([]);
  });

  it("정규형으로 읽는다 — 코드순·중복 제거", () => {
    expect(parseDeliveredLocaleChanges([
      { localeCode: "fr", effect: "create" },
      { localeCode: "de", effect: "delete" },
      { localeCode: "fr", effect: "create" },
    ])).toEqual([{ localeCode: "de", effect: "delete" }, { localeCode: "fr", effect: "create" }]);
  });

  it("모양이 틀린 원소는 버린다 — 다른 버전이 쓴 값이 와도 죽지 않는다", () => {
    expect(parseDeliveredLocaleChanges({ fr: "create" })).toEqual([]);
    expect(parseDeliveredLocaleChanges("fr")).toEqual([]);
    expect(parseDeliveredLocaleChanges([
      null, 1, "fr", [], { localeCode: 3, effect: "create" }, { localeCode: "fr", effect: "rename" }, { localeCode: "", effect: "delete" },
      { localeCode: "ko", effect: "delete" },
    ])).toEqual([{ localeCode: "ko", effect: "delete" }]);
  });

  it("프로토타입에서 찾아진 값을 읽지 않는다 — __proto__ 코드는 평범한 코드다", () => {
    const inherited = Object.create({ localeCode: "fr", effect: "create" }) as object;
    expect(parseDeliveredLocaleChanges([inherited])).toEqual([]);
    expect(parseDeliveredLocaleChanges([{ localeCode: "__proto__", effect: "delete" }])).toEqual([{ localeCode: "__proto__", effect: "delete" }]);
  });
});

describe("deliveredOf", () => {
  it("확인 행이 없으면 전달한 것이 없다", () => {
    expect(deliveredOf(null)).toEqual([]);
  });

  it("무효화 중이면 확인 안 됨(null)이다", () => {
    expect(deliveredOf({ deliveredLocaleChanges: [{ localeCode: "fr", effect: "create" }], invalidatedAt: new Date() })).toBeNull();
  });

  it("유효한 확인은 저장된 목록이다", () => {
    expect(deliveredOf({ deliveredLocaleChanges: [{ localeCode: "fr", effect: "create" }], invalidatedAt: null })).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(deliveredOf({ deliveredLocaleChanges: null, invalidatedAt: null })).toEqual([]);
  });
});

describe("localeWork", () => {
  it("현재 목록 = 전달 목록이면 작업 0", () => {
    expect(localeWork([{ localeCode: "fr", effect: "create" }], [{ localeCode: "fr", effect: "create" }])).toEqual([]);
    expect(localeWork([], [])).toEqual([]);
  });

  it("전달 전 요청은 언어별 작업이다", () => {
    expect(localeWork([{ localeCode: "de", effect: "delete" }, { localeCode: "fr", effect: "create" }], [])).toEqual([
      { localeCode: "de", current: "delete", delivered: null },
      { localeCode: "fr", current: "create", delivered: null },
    ]);
  });

  it("전달 후 취소는 그 언어의 작업으로 남는다 — 다음 Publish가 정리한다", () => {
    expect(localeWork([], [{ localeCode: "de", effect: "delete" }])).toEqual([{ localeCode: "de", current: null, delivered: "delete" }]);
  });

  it("전달 전 취소는 목록이 돌아가 작업이 저절로 0이다", () => {
    const delivered = [{ localeCode: "fr", effect: "create" as const }];
    expect(localeWork(delivered, delivered)).toEqual([]);
  });

  it("확인 안 됨(null)은 현재 효과 전부를 미전달로 본다", () => {
    expect(localeWork([{ localeCode: "fr", effect: "create" }], null)).toEqual([{ localeCode: "fr", current: "create", delivered: null }]);
    expect(localeWork([], null)).toEqual([]);
  });

  it("코드순이고 __proto__는 평범한 코드다", () => {
    expect(localeWork([{ localeCode: "__proto__", effect: "delete" }, { localeCode: "Es", effect: "delete" }], [{ localeCode: "zh_TW", effect: "create" }]))
      .toEqual([
        { localeCode: "Es", current: "delete", delivered: null },
        { localeCode: "__proto__", current: "delete", delivered: null },
        { localeCode: "zh_TW", current: null, delivered: "create" },
      ]);
  });
});

/**
 * **확인보다 뒤에 낸 요청의 효과는 전달로 세지 않는다** (F1 fix1 — design §1). 전달 후 취소로 행 없이 남은 전달 목록은 PR이 머지 없이 닫혀도
 * 정리되지 않는다 — 그 뒤 같은 언어를 다시 요청하면 현재 = 전달이 되어 Publish가 싣지 않고 다음 방문이 지운다. 경계는 확인한 실행의 시작 시각이다.
 */
describe("deliveredForRequests", () => {
  const confirmedFrom = new Date("2026-10-14T10:00:00.000Z");
  const at = (iso: string) => new Date(iso);
  const delivered = [{ localeCode: "fr", effect: "create" as const }, { localeCode: "ko", effect: "delete" as const }];
  const current = [{ localeCode: "fr", effect: "create" as const }, { localeCode: "ko", effect: "delete" as const }];

  it("확인한 실행이 시작된 뒤(같은 밀리초 포함)에 낸 요청의 코드는 전달 목록에서 견주지 않는다 — 다른 코드의 효과는 남는다", () => {
    expect(deliveredForRequests(delivered, [{ localeCode: "ko", requestedAt: at("2026-10-14T10:00:00.001Z") }], confirmedFrom, current))
      .toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(deliveredForRequests(delivered, [{ localeCode: "ko", requestedAt: confirmedFrom }], confirmedFrom, current))
      .toEqual([{ localeCode: "fr", effect: "create" }]);
  });

  it("확인보다 앞선 요청은 그대로 견준다", () => {
    expect(deliveredForRequests(delivered, [{ localeCode: "ko", requestedAt: at("2026-10-14T09:59:59.999Z") }, { localeCode: "fr", requestedAt: at("2026-10-01T00:00:00.000Z") }], confirmedFrom, current))
      .toEqual(delivered);
  });

  it("확인 뒤 요청이 현재 효과를 내지 않으면(값 0개 ADD) 옛 효과를 남긴다 — 열린 PR에 실렸을 수 있어 Publish가 거둬야 한다", () => {
    expect(deliveredForRequests(delivered, [{ localeCode: "fr", requestedAt: at("2026-10-14T11:00:00.000Z") }], confirmedFrom, [{ localeCode: "ko", effect: "delete" }]))
      .toEqual(delivered);
  });

  it("확인 안 됨(null)은 그대로 null이다 — 확인 시각이 없으면(확인 행 없음) 목록 그대로다", () => {
    expect(deliveredForRequests(null, [{ localeCode: "ko", requestedAt: at("2026-10-15T00:00:00.000Z") }], confirmedFrom, current)).toBeNull();
    expect(deliveredForRequests([], [{ localeCode: "ko", requestedAt: at("2026-10-15T00:00:00.000Z") }], null, current)).toEqual([]);
  });
});

describe("foldLocaleStates", () => {
  const at = (ms: number) => new Date(ms);
  const change = (surfaceId: string, localeCode: string, operation: "ADD" | "REMOVE", requestedAt = at(1_000), orphaned = false) =>
    ({ surfaceId, localeCode, operation, requestedAt, locale: { orphaned } });
  const confirmation = (surfaceId: string, deliveredLocaleChanges: unknown, startedAt = at(2_000), invalidatedAt: Date | null = null) =>
    ({ surfaceId, deliveredLocaleChanges, invalidatedAt, syncRun: { startedAt } });

  it("소스 id순(코드 유닛)·소스 안은 코드순이다 — 승인 지문이 이 순서에 기댄다", () => {
    const states = foldLocaleStates(
      [change("s-b", "ko", "REMOVE"), change("s-a", "ko", "REMOVE"), change("s-a", "de", "REMOVE"), change("S-c", "fr", "REMOVE")],
      [],
      new Map(),
    );
    expect(states.map(state => state.surfaceId)).toEqual(["S-c", "s-a", "s-b"]);
    expect(states[1]?.rows.map(row => row.localeCode)).toEqual(["de", "ko"]);
  });

  it("행도 비지 않은 전달 목록도 없는 소스는 뺀다 — 빈 목록·확인 안 됨(null)은 작업을 만들 수 없다", () => {
    const states = foldLocaleStates(
      [],
      [confirmation("s-empty", []), confirmation("s-null", [{ localeCode: "fr", effect: "create" }], at(2_000), at(3_000)), confirmation("s-reap", [{ localeCode: "fr", effect: "create" }])],
      new Map(),
    );
    expect(states.map(state => [state.surfaceId, state.work])).toEqual([["s-reap", [{ localeCode: "fr", current: null, delivered: "create" }]]]);
  });

  it("값 수가 없는 ADD는 효과가 없다 — 값 0개 ADD는 작업이 아니다", () => {
    const [state] = foldLocaleStates([change("s", "fr", "ADD"), change("s", "de", "ADD")], [], new Map([["s", new Map([["de", 2]])]]));
    expect(state?.current).toEqual([{ localeCode: "de", effect: "create" }]);
    expect(state?.valueCounts).toEqual(new Map([["de", 2]]));
    expect(state?.work.map(item => item.localeCode)).toEqual(["de"]);
  });

  it("확인보다 뒤에 낸 같은 언어의 요청은 전달로 세지 않고, 저장 목록은 그대로 둔다 (POSTMORTEM 2026-10-14)", () => {
    const [state] = foldLocaleStates([change("s", "ko", "REMOVE", at(2_000))], [confirmation("s", [{ localeCode: "ko", effect: "delete" }], at(2_000))], new Map());
    expect(state?.delivered).toEqual([]);
    expect(state?.storedDelivered).toEqual([{ localeCode: "ko", effect: "delete" }]);
    expect(state?.work).toEqual([{ localeCode: "ko", current: "delete", delivered: null }]);
  });

  it("확인 안 됨(null)이면 현재 효과 전부가 작업이다", () => {
    const [state] = foldLocaleStates([change("s", "ko", "REMOVE")], [confirmation("s", [{ localeCode: "ko", effect: "delete" }], at(2_000), at(3_000))], new Map());
    expect(state?.delivered).toBeNull();
    expect(state?.storedDelivered).toBeNull();
    expect(state?.work).toEqual([{ localeCode: "ko", current: "delete", delivered: null }]);
  });
});

describe("readLocaleStatesByProject — 호출 모양", () => {
  function fakeDb(changes: unknown[]) {
    const db = {
      localeChange: { findMany: vi.fn(async () => changes) },
      deliveryConfirmation: { findMany: vi.fn(async () => []) },
      $queryRaw: vi.fn(async () => []),
    };
    return { db, client: db as unknown as PrismaClient };
  }

  it("ids가 비면 조회하지 않는다", async () => {
    const { db, client } = fakeDb([]);
    expect(await readLocaleStatesByProject(client, [])).toEqual(new Map());
    expect(db.localeChange.findMany).not.toHaveBeenCalled();
    expect(db.deliveryConfirmation.findMany).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("projectId in ids로 좁힌 조회 둘이고, ADD 행이 없으면 값 수 raw를 부르지 않는다 — 요청한 id마다 항목이 있다", async () => {
    const { db, client } = fakeDb([{ projectId: "p1", surfaceId: "s", localeCode: "ko", operation: "REMOVE", requestedAt: new Date(0), locale: { orphaned: false } }]);
    const states = await readLocaleStatesByProject(client, ["p1", "p2", "p1"]);
    expect([...states.keys()]).toEqual(["p1", "p2"]);
    expect(states.get("p1")?.map(state => state.work.length)).toEqual([1]);
    expect(states.get("p2")).toEqual([]);
    expect(db.localeChange.findMany).toHaveBeenCalledTimes(1);
    expect(db.deliveryConfirmation.findMany).toHaveBeenCalledTimes(1);
    expect(db.localeChange.findMany.mock.calls[0]).toMatchObject([{ where: { projectId: { in: ["p1", "p2"] } } }]);
    expect(db.deliveryConfirmation.findMany.mock.calls[0]).toMatchObject([{ where: { projectId: { in: ["p1", "p2"] } } }]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("ADD 행이 있으면 값 수 raw를 한 번 부른다 — 프로젝트 수와 무관하다", async () => {
    const { db, client } = fakeDb([
      { projectId: "p1", surfaceId: "s1", localeCode: "fr", operation: "ADD", requestedAt: new Date(0), locale: { orphaned: false } },
      { projectId: "p2", surfaceId: "s2", localeCode: "de", operation: "ADD", requestedAt: new Date(0), locale: { orphaned: false } },
    ]);
    await readLocaleStatesByProject(client, ["p1", "p2"]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
