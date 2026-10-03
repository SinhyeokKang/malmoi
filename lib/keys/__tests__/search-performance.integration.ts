import { afterAll, beforeAll, expect, it } from "vitest";
import { searchKeys } from "@/lib/keys/search";
import { searchFixture } from "./search-fixture";

const db = searchFixture();
const MEMBER_ROWS = 200100;
beforeAll(async () => {
  await db.start();
  await db.reset();
  for (const [p, user] of [["member", "u1"], ["second", "u1"], ["foreign", "u2"]] as const) await db.project(p, user);
  for (const [p, s, n] of [["member", "large", 20000], ["second", "small", 10], ["foreign", "other1", 20000], ["foreign", "other2", 20000], ["foreign", "other3", 20000]] as const) {
    await db.surface(p, s, Array.from({ length: 10 }, (_, i) => `l${i}`));
    await db.pool.query(`INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt")
      SELECT $2 || '-' || i, $1, $2, 'key-' || lpad(i::text,5,'0'), '_root', 'Source text ' || i, 'hash', now() FROM generate_series(1,$3::int) i`, [p, s, n]);
    // FK용 플래너 통계도 없는 대량 시드는 행마다 재검사 비용이 커진다. 이미 만든 키×로케일만
    // 넣는 이 픽스처 트랜잭션에서만 트리거를 끄고, 측정 연결은 정상 역할·5초 제한을 유지한다.
    const seed = await db.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = replica");
      for (let start = 1; start <= n; start += 1000) await seed.query(`INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"updatedAt")
        SELECT $2 || '-' || i || '-' || l, $1, $2, $2 || '-' || i, 'l' || l,
          'common translated content ' || i || CASE WHEN i=12345 THEN ' unique-translation' ELSE '' END, now()
        FROM generate_series($3::int,$4::int) i CROSS JOIN generate_series(0,9) l`, [p, s, start, Math.min(start + 999, n)]);
      await seed.query("COMMIT");
    } catch (error) {
      await seed.query("ROLLBACK");
      throw error;
    } finally {
      seed.release();
    }
  }
}, 60000);
afterAll(() => db.stop());

type Plan = {
  "Node Type": string; "Relation Name"?: string; "Index Cond"?: string; "Recheck Cond"?: string;
  "Subplan Name"?: string; "Function Call"?: string; "Alias"?: string; "Actual Rows": number; "Actual Loops": number;
  "Rows Removed by Filter"?: number; "Rows Removed by Index Recheck"?: number; Plans?: Plan[];
};
const nodes = (p: Plan): Plan[] => [p, ...(p.Plans ?? []).flatMap(nodes)];
const visits = (p: Plan) => nodes(p).filter(n => n["Relation Name"] === "Translation").reduce((sum, n) => sum +
  (n["Actual Rows"] + (n["Rows Removed by Filter"] ?? 0) + (n["Rows Removed by Index Recheck"] ?? 0)) * n["Actual Loops"], 0);

/** 방문 수만으로는 비멤버 제외를 증명할 수 없어 접근 조건과 멤버 배열 InitPlan도 함께 검사한다. */
function bounded(p: Plan): boolean {
  const all = nodes(p);
  const scans = all.filter(n => n["Relation Name"] === "Translation");
  const memberPlans = all.filter(n => n["Subplan Name"]?.startsWith("InitPlan") && nodes(n).some(c => c["Relation Name"] === "ProjectMember"));
  const memberParams = memberPlans.flatMap(n => [
    ...(n["Subplan Name"]?.match(/\$\d+/g) ?? []),
    `(${n["Subplan Name"]}).col1`,
  ]);
  const memberAliases = all.filter(n => n["Node Type"] === "Function Scan" &&
    memberParams.some(param => n["Function Call"]?.includes(`unnest(${param})`))).map(n => n.Alias);
  return scans.length > 0 && visits(p) < MEMBER_ROWS * 2 && scans.every(scan =>
    nodes(scan).some(n => {
      const condition = n["Index Cond"] ?? n["Recheck Cond"] ?? "";
      return condition.includes('"projectId"') && (memberParams.some(param => condition.includes(`ANY (${param})`)) || memberAliases.some(alias => condition.includes(`= ${alias}.id`)));
    }));
}

it("방문 검출기는 탈락 행·재검사·loops를 포함하고 무제한 스캔을 거부한다", () => {
  const p: Plan = { "Node Type": "Seq Scan", "Relation Name": "Translation", "Actual Rows": 2, "Actual Loops": 3, "Rows Removed by Filter": 4, "Rows Removed by Index Recheck": 5 };
  expect(visits(p)).toBe(33);
  expect(bounded(p)).toBe(false);
});

it("통계 없음과 ANALYZE 뒤 네 질의 각 20회의 계획·중앙값을 검증한다", async () => {
  expect(Number((await db.pool.query('SELECT count(*) FROM "Translation" WHERE "projectId" = $1', ["foreign"])).rows[0].count)).toBeGreaterThan(MEMBER_ROWS * 2);
  for (const stats of ["none", "analyzed"] as const) {
    if (stats === "analyzed") await db.pool.query("ANALYZE");
    else expect((await db.pool.query("SELECT count(*) FROM pg_stats WHERE schemaname='public' AND tablename='Translation'")).rows[0].count).toBe("0");
    // 실제 전체 스캔 대조군이다 — 작은 합성 계획만 거부하는 가짜 검출기를 막는다.
    const control = await db.pool.query('EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) SELECT * FROM "Translation"');
    const controlPlan = control.rows[0]["QUERY PLAN"][0].Plan as Plan;
    expect(nodes(controlPlan).some(n => n["Node Type"] === "Seq Scan" && n["Relation Name"] === "Translation")).toBe(true);
    expect(bounded(controlPlan)).toBe(false);
    for (const q of ["no-match-at-all", "key-123", "unique-translation", "common"]) {
      const times: number[] = [];
      let maxVisits = 0;
      for (let repetition = 0; repetition < 20; repetition++) {
        db.captured.length = 0;
        const hits = await searchKeys(db.prisma, { userId: "u1", q, activeSlug: "member" });
        expect(hits.every(h => h.slug !== "foreign")).toBe(true);
        expect(hits).toHaveLength(q === "no-match-at-all" ? 0 : q === "unique-translation" ? 1 : 5);
        expect(db.captured).toHaveLength(q === "key-123" ? 1 : 2);
        let time = 0;
        for (const captured of db.captured) {
          const explained = await db.pool.query("EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) " + captured.query, JSON.parse(captured.params));
          const plan = explained.rows[0]["QUERY PLAN"][0] as { Plan: Plan; "Execution Time": number };
          time += plan["Execution Time"];
          if (nodes(plan.Plan).some(n => n["Relation Name"] === "Translation")) {
            expect(bounded(plan.Plan), JSON.stringify(plan.Plan)).toBe(true);
            maxVisits = Math.max(maxVisits, visits(plan.Plan));
          }
        }
        times.push(time);
      }
      times.sort((a, b) => a - b);
      const median = (times[9]! + times[10]!) / 2;
      console.log(JSON.stringify({ stats, q, repetitions: times.length, medianMs: median, maxTranslationVisits: maxVisits, memberRows: MEMBER_ROWS }));
      expect.soft(median).toBeLessThanOrEqual(300);
    }
  }
}, 180000);
