import { beforeEach, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { loadProjectListAggregates } from "../query";

/**
 * **목록 집계의 왕복 수가 상수다** (projects-list design §3).
 *
 * ⚠️ **프로젝트 수에 비례해 쿼리가 늘면 안 된다.** 도쿄 리전 왕복 하나가 고정 비용으로 붙고
 * (CLAUDE.md 가상화 절의 실측), 그것이 이 화면에서 N배가 되면 로그인 직후의 착지점이 느려진다.
 * 그래서 다섯을 `Promise.all`로 보내고 접기는 순수 함수가 한다.
 *
 * ⚠️ **`in: ids`가 테넌트 경계다** (ARCHITECTURE §0 불변식 5). `ids`는 `loadProjectList`가 이미
 * 인가한 내 멤버십 집합이고, 다른 출처에서 만들지 않는다.
 */

const hoisted = vi.hoisted(() => ({
  locale: { findMany: vi.fn() },
  stringKey: { groupBy: vi.fn() },
  translation: { groupBy: vi.fn() },
  queryRaw: vi.fn(),
}));

const db = {
  locale: hoisted.locale,
  stringKey: hoisted.stringKey,
  translation: hoisted.translation,
  $queryRaw: hoisted.queryRaw,
} as unknown as PrismaClient;

const calls = () =>
  hoisted.locale.findMany.mock.calls.length +
  hoisted.stringKey.groupBy.mock.calls.length +
  hoisted.translation.groupBy.mock.calls.length +
  hoisted.queryRaw.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.locale.findMany.mockResolvedValue([]);
  hoisted.stringKey.groupBy.mockResolvedValue([]);
  hoisted.translation.groupBy.mockResolvedValue([]);
  hoisted.queryRaw.mockResolvedValue([]);
});

it.each([1, 5, 40])("프로젝트가 %i개여도 집계는 다섯 번이다", async (n) => {
  await loadProjectListAggregates(db, Array.from({ length: n }, (_, i) => `p${i}`));
  expect(calls()).toBe(5);
});

/** 빈 `in`으로 왕복을 만들지 않는다 — `loadActors`가 같은 이유로 같은 가드를 든다. */
it("프로젝트가 0개면 아무것도 조회하지 않는다", async () => {
  const got = await loadProjectListAggregates(db, []);
  expect(calls()).toBe(0);
  expect(got).toEqual({ locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map() });
});

it("모든 조회가 인가된 id 집합으로 좁혀진다 — 테넌트 간 유출 경로가 여기다", async () => {
  const ids = ["p1", "p2"];
  await loadProjectListAggregates(db, ids);

  expect(hoisted.locale.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ids } }) }),
  );
  for (const groupBy of [hoisted.stringKey.groupBy, hoisted.translation.groupBy]) {
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ids } }) }),
    );
  }
  // raw 둘은 파라미터화된 배열로 좁힌다 — 문자열 연결·`$queryRawUnsafe`는 쓰지 않는다.
  for (const call of hoisted.queryRaw.mock.calls) expect(call).toContainEqual(ids);
});

/** ①은 살아 있는 로케일만, ②는 살아 있는 키만 — 분자와 분모가 같은 조건을 봐야 한다. */
it("orphaned를 양쪽에서 뺀다", async () => {
  await loadProjectListAggregates(db, ["p1"]);
  expect(hoisted.locale.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ orphaned: false }) }),
  );
  expect(hoisted.stringKey.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ orphaned: false }) }),
  );
  expect(hoisted.translation.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ value: { not: "" }, stringKey: { orphaned: false } }),
    }),
  );
});

/**
 * ⚠️ **`value`를 select하지 않는다** — `groupBy`는 애초에 행을 안 가져오므로 이 위험이 없고,
 * 그래서 `loadLocaleCounts`를 재사용하지 않는다(그쪽은 프로젝트 하나 전용 + 셀을 전부 가져온다).
 */
it("번역 집계는 세 축으로 묶는다 — 행을 가져오지 않는다", async () => {
  await loadProjectListAggregates(db, ["p1"]);
  expect(hoisted.translation.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ by: ["projectId", "surfaceId", "localeCode", "needsReview"] }),
  );
});

it("결과를 프로젝트별 Map으로 접는다", async () => {
  hoisted.locale.findMany.mockResolvedValue([{ projectId: "p1", surfaceId: "s1", surface: { slug: "default" }, code: "en", isBase: true }]);
  hoisted.stringKey.groupBy.mockResolvedValue([{ projectId: "p1", surfaceId: "s1", _count: { _all: 10 } }]);
  hoisted.translation.groupBy.mockResolvedValue([
    { projectId: "p1", surfaceId: "s1", localeCode: "en", needsReview: false, _count: { _all: 7 } },
  ]);
  hoisted.queryRaw
    .mockResolvedValueOnce([{ projectId: "p1", n: 2 }])
    .mockResolvedValueOnce([{ projectId: "p1", n: 5 }]);

  const got = await loadProjectListAggregates(db, ["p1"]);

  expect(got.locales).toEqual([{ projectId: "p1", surfaceId: "s1", surfaceSlug: "default", code: "en", isBase: true }]);
  expect(got.keyTotals.get("s1")).toBe(10);
  expect(got.cells).toEqual([{ projectId: "p1", surfaceId: "s1", localeCode: "en", needsReview: false, count: 7 }]);
  expect(got.newKeys.get("p1")).toBe(2);
  expect(got.unsent.get("p1")).toBe(5);
});

/** 조회 결과에 없는 프로젝트는 0이다 — `undefined`가 화면까지 가지 않는다. */
it("집계에 없는 프로젝트의 수치는 조회되지 않은 채로 남는다", async () => {
  const got = await loadProjectListAggregates(db, ["p1", "p2"]);
  expect(got.keyTotals.get("p2")).toBeUndefined();
  expect(got.newKeys.get("p2")).toBeUndefined();
});

/** 59로케일 리포(`i18n-many-locales`)에서도 조회 수는 그대로다. */
it("로케일이 59개여도 왕복이 늘지 않는다", async () => {
  hoisted.locale.findMany.mockResolvedValue(
    Array.from({ length: 59 }, (_, i) => ({ projectId: "p1", surfaceId: "s1", surface: { slug: "default" }, code: `l${i}`, isBase: i === 0 })),
  );
  await loadProjectListAggregates(db, ["p1"]);
  expect(calls()).toBe(5);
});
