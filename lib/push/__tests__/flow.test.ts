import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, detectFormat } from "@/lib/adapters/index";
import { applyPush } from "../apply";
import { buildPushPayload, pickBaseLocale, selectLocaleFiles } from "../payload";
import { sourceHash, type ExistingKey } from "../plan";

/**
 * **push 흐름을 끝에서 끝까지 본다** (TASKS §0 B-1). 홉마다 단위 테스트가 있어도
 * 이어 붙인 것을 보는 테스트가 없으면 값이 홉 사이에서 사라진다 — 이 리포의 반복 실패
 * 유형이고 `docs/POSTMORTEM.md`에 넷 있다.
 *
 * 경로: 로케일 파일 → `detect` → `read` → `buildPushPayload` → `planPush` → **SQL 인자**.
 * DB를 치지 않고 `$executeRaw`가 받은 값을 캡처해 단언한다 — 실 DB 왕복은 재현 가능한
 * 게이트가 아니다(그리고 dev DB가 곧 prod DB다).
 */

const FILES: Record<string, string> = {
  "_locales/en/messages.json": JSON.stringify({
    zebra: { message: "Zebra", description: "동물" },
    apple: { message: "Apple", placeholders: { u: { content: "$1" } } },
    empty: { message: "" },
  }, null, 2),
  "_locales/ko/messages.json": JSON.stringify({
    zebra: { message: "얼룩말" },
    apple: { message: "사과", description: "ko쪽 설명" },
  }, null, 2),
};

const PROJECT_ID = "proj-1";

/** `$executeRaw`가 실제로 받은 SQL과 값. */
type Captured = { sql: string; values: unknown[] };

type Stub = {
  prisma: PrismaClient;
  captured: Captured[];
  projectUpdates: unknown[];
};

function stubPrisma(existing: readonly ExistingKey[], allKeys: readonly string[]): Stub {
  const captured: Captured[] = [];
  const projectUpdates: unknown[] = [];

  const prisma = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]): Captured => {
      const c = { sql: strings.join(" ? "), values };
      captured.push(c);
      return c;
    },
    // 배열형 트랜잭션은 문장 순서대로 영향 행수를 돌려준다.
    $transaction: async (arr: readonly unknown[]) => arr.map(() => 1),
    stringKey: {
      findMany: async (args: { select: Record<string, boolean> }) =>
        // 첫 호출은 계획용(sourceHash까지), 두 번째는 insert 후 id 조회다.
        args.select["sourceHash"]
          ? existing
          : [...new Set([...existing.map((e) => e.key), ...allKeys])].map((key) => ({ id: `id-${key}`, key })),
    },
    project: {
      update: async (args: unknown) => {
        projectUpdates.push(args);
        return {};
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, captured, projectUpdates };
}

/**
 * unnest 문장의 값 배열을 컬럼 이름에 붙인다. **이름 개수와 배열 개수가 같아야 한다는 것 자체가
 * 계약이다** — unnest 인자 순서가 컬럼 목록과 어긋나면 값이 옆 컬럼으로 들어간다.
 */
function columnsOf(c: Captured): Record<string, unknown[]> {
  const m = /AS v\(([^)]*)\)/.exec(c.sql) ?? /INSERT INTO "[A-Za-z]+" \(([^)]*)\)/.exec(c.sql);
  const names = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/"/g, ""));
  const arrays = c.values.filter((v): v is unknown[] => Array.isArray(v));
  expect(names.length, `컬럼 ${names.length}개 vs 값 배열 ${arrays.length}개: ${c.sql.slice(0, 60)}`).toBe(arrays.length);
  return Object.fromEntries(names.map((n, i) => [n, arrays[i] ?? []]));
}

const stmt = (captured: readonly Captured[], needle: string): Captured => {
  const hit = captured.filter((c) => c.sql.includes(needle));
  expect(hit, `"${needle}" 문장`).toHaveLength(1);
  return hit[0]!;
};

const has = (captured: readonly Captured[], needle: string): boolean =>
  captured.some((c) => c.sql.includes(needle));

/** 로케일 파일에서 페이로드까지 — `scripts/push-local.ts`가 하는 것과 같은 순서다. */
function payloadFromFiles(scanRefs: Parameters<typeof buildPushPayload>[0]["scanRefs"] = []) {
  const paths = Object.keys(FILES);
  const probe = (p: string) => FILES[p];
  const format = detectFormat(paths, probe);
  expect(format, "chrome-locales를 탐지해야 한다").toBeDefined();
  const adapter = adapterFor(format!);
  const files = selectLocaleFiles(adapter.layout, format!, paths, probe);
  const read = adapter.read(format!, files);
  expect(read.errors).toEqual([]);
  const baseLocale = pickBaseLocale(format!.locales);
  return buildPushPayload({
    projectSlug: "acme",
    commitSha: "a".repeat(40),
    commitAt: "2026-09-03T00:00:00+09:00",
    format: format!,
    read,
    baseLocale: baseLocale!,
    scanRefs,
  }).payload;
}

async function runFlow(options: {
  existing?: readonly ExistingKey[];
  scanRefs?: Parameters<typeof buildPushPayload>[0]["scanRefs"];
} = {}) {
  const payload = payloadFromFiles(options.scanRefs ?? []);
  const stub = stubPrisma(options.existing ?? [], payload.keys.map((k) => k.key));
  const outcome = await applyPush(stub.prisma, PROJECT_ID, payload);
  return { ...stub, payload, outcome };
}

describe("push 흐름 — 신규 프로젝트 (DB가 비어 있다)", () => {
  it("키의 모든 필드가 SQL 인자까지 도착한다", async () => {
    const { captured } = await runFlow();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'));

    expect(cols["key"]).toEqual(["apple", "empty", "zebra"]);
    expect(cols["sourceText"]).toEqual(["Apple", "", "Zebra"]);
    expect(cols["namespace"]).toEqual(["_root", "_root", "_root"]);
    expect(cols["sourceHash"]).toEqual(["Apple", "", "Zebra"].map(sourceHash));
    expect(cols["projectId"]).toEqual([PROJECT_ID, PROJECT_ID, PROJECT_ID]);
    expect(cols["orphaned"]).toEqual([false, false, false]);
  });

  it("파일 순서가 sortIndex로 도착하고 0이 살아남는다 — falsy 함정이 4홉을 지난다", async () => {
    const { captured } = await runFlow();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'));
    // 파일은 zebra, apple, empty 순이고 키는 정렬돼 나간다.
    expect(cols["sortIndex"]).toEqual([1, 2, 0]);
  });

  it("키의 description은 base 파일의 것만 싣고 없으면 null이다", async () => {
    const { captured } = await runFlow();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'));
    expect(cols["description"]).toEqual([null, null, "동물"]);
  });

  it("번역 값·로케일별 description·placeholders가 전부 도착한다", async () => {
    const { captured } = await runFlow();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "Translation"'));

    const rows = (cols["keyId"] ?? []).map((keyId, i) => ({
      keyId,
      locale: cols["localeCode"]?.[i],
      value: cols["value"]?.[i],
      description: cols["description"]?.[i],
      placeholders: cols["placeholders"]?.[i],
    }));

    expect(rows).toEqual([
      { keyId: "id-apple", locale: "en", value: "Apple", description: null, placeholders: '{"u":{"content":"$1"}}' },
      // base 파일의 description은 **키 메타데이터이면서 그 로케일 파일이 실제로 가진 값**이라
      // 양쪽에 실린다. 합치는 것이 아니다 — 두 축이 우연히 같은 출처를 가질 뿐이다.
      { keyId: "id-zebra", locale: "en", value: "Zebra", description: "동물", placeholders: null },
      { keyId: "id-apple", locale: "ko", value: "사과", description: "ko쪽 설명", placeholders: null },
      { keyId: "id-zebra", locale: "ko", value: "얼룩말", description: null, placeholders: null },
    ]);
  });

  it("빈 값 번역은 실리지 않지만 키는 남는다 — 번역이 없는 것과 키가 없는 것은 다르다", async () => {
    const { captured } = await runFlow();
    expect(columnsOf(stmt(captured, 'INSERT INTO "StringKey"'))["key"]).toContain("empty");
    expect(columnsOf(stmt(captured, 'INSERT INTO "Translation"'))["value"]).not.toContain("");
  });

  it("base 로케일도 Translation 행을 갖는다 — base도 편집 대상이다", async () => {
    const { captured } = await runFlow();
    expect(columnsOf(stmt(captured, 'INSERT INTO "Translation"'))["localeCode"]).toContain("en");
  });

  it("Locale upsert에서 base만 isBase=true다", async () => {
    const { captured } = await runFlow();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "Locale"'));
    const byCode = Object.fromEntries((cols["code"] ?? []).map((c, i) => [c, cols["isBase"]?.[i]]));
    expect(byCode).toEqual({ en: true, ko: false });
  });

  it("refs가 keyId로 이어져 도착하고, 로케일 파일에 없는 키의 참조는 버려진다", async () => {
    const { captured, outcome } = await runFlow({
      scanRefs: [
        { key: "apple", refs: [{ path: "src/a.ts", line: 3 }, { path: "src/b.ts", line: 7 }] },
        { key: "ghost", refs: [{ path: "src/c.ts", line: 1 }] },
      ],
    });
    const cols = columnsOf(stmt(captured, 'INSERT INTO "KeyRef"'));
    expect(cols["keyId"]).toEqual(["id-apple", "id-apple"]);
    expect(cols["path"]).toEqual(["src/a.ts", "src/b.ts"]);
    expect(cols["line"]).toEqual([3, 7]);
    expect(outcome.refs).toBe(2);
  });

  it("refs는 전체 교체다 — 삽입 전에 항상 지운다", async () => {
    const { captured } = await runFlow();
    expect(has(captured, 'DELETE FROM "KeyRef"')).toBe(true);
    // 참조가 0건이어도 삭제는 돈다(마지막 참조가 사라진 경우).
    expect(has(captured, 'INSERT INTO "KeyRef"')).toBe(false);
  });

  it("포맷과 커밋 정보가 Project에 실린다 — pull이 이 값을 읽는다", async () => {
    const { projectUpdates } = await runFlow();
    expect(projectUpdates).toEqual([{
      where: { id: PROJECT_ID },
      data: {
        adapterName: "chrome-locales",
        pathTemplate: "_locales/{locale}/messages.json",
        nested: false,
        baseLocale: "en",
        lastCommitSha: "a".repeat(40),
        lastCommitAt: new Date("2026-09-03T00:00:00+09:00"),
      },
    }]);
  });

  it("모든 쿼리가 projectId로 좁혀진다 — 테넌트 간 유출 경로가 여기다", async () => {
    const { captured } = await runFlow({ scanRefs: [{ key: "apple", refs: [{ path: "a.ts", line: 1 }] }] });
    for (const c of captured) {
      // KeyRef는 자기 컬럼에 projectId가 없어 StringKey를 거쳐 좁힌다.
      const scoped = c.values.some((v) => v === PROJECT_ID || (Array.isArray(v) && v.includes(PROJECT_ID)))
        || c.sql.includes('FROM "StringKey" WHERE "projectId"')
        || c.sql.includes('INSERT INTO "KeyRef"');
      expect(scoped, c.sql.slice(0, 80)).toBe(true);
    }
  });
});

describe("push 흐름 — 기존 키가 있다", () => {
  const existingZebra: ExistingKey = {
    id: "id-zebra",
    key: "zebra",
    sourceHash: sourceHash("Zebra"),
    orphaned: false,
  };

  it("기존 키는 UPDATE로, 새 키만 INSERT로 간다", async () => {
    const { captured } = await runFlow({ existing: [existingZebra] });
    expect(columnsOf(stmt(captured, 'INSERT INTO "StringKey"'))["key"]).toEqual(["apple", "empty"]);
    expect(columnsOf(stmt(captured, 'UPDATE "StringKey" AS s'))["key"]).toEqual(["zebra"]);
  });

  it("UPDATE 경로에서도 sortIndex가 매번 새로 박힌다 — drift가 없는 근거다", async () => {
    const { captured } = await runFlow({ existing: [existingZebra] });
    expect(columnsOf(stmt(captured, 'UPDATE "StringKey" AS s'))["sortIndex"]).toEqual([0]);
  });

  it("코드에서 사라진 키는 orphaned로 표시하고 삭제하지 않는다", async () => {
    const gone: ExistingKey = { id: "id-gone", key: "gone", sourceHash: "h", orphaned: false };
    const { captured, outcome } = await runFlow({ existing: [existingZebra, gone] });
    const orphan = stmt(captured, '"orphaned" = true');
    expect(orphan.values).toContainEqual(["id-gone"]);
    expect(outcome.orphaned).toBe(1);
    expect(has(captured, "DELETE FROM \"StringKey\"")).toBe(false);
  });

  it("원문이 바뀌면 needsReview가 base 아닌 로케일에만 전파된다", async () => {
    const changed: ExistingKey = { ...existingZebra, sourceHash: sourceHash("옛날 원문") };
    const { captured } = await runFlow({ existing: [changed] });
    const stale = stmt(captured, '"needsReview" = true');
    expect(stale.values).toContainEqual(["id-zebra"]);
    // base 로케일은 원문 자체라 검토 대상이 아니다.
    expect(stale.values).toContain("en");
    expect(stale.sql).toContain('"localeCode" <> ');
  });

  it("원문이 그대로면 needsReview 문장이 아예 없다", async () => {
    const { captured } = await runFlow({ existing: [existingZebra] });
    expect(has(captured, '"needsReview" = true')).toBe(false);
  });

  it("orphaned였던 키가 돌아오면 되살아난다", async () => {
    const { captured, outcome } = await runFlow({ existing: [{ ...existingZebra, orphaned: true }] });
    expect(outcome.unorphaned).toBe(1);
    // 되살리기는 UPDATE 문장의 `"orphaned" = false`가 겸한다.
    expect(stmt(captured, 'UPDATE "StringKey" AS s').sql).toContain('"orphaned" = false');
  });
});

/**
 * **musicblocks 모양** (ARCHITECTURE §1.35): 로케일 파일 하나만 중첩인데 포맷 단위 boolean이
 * 형제 파일까지 중첩으로 만들어 평평한 파일의 점 키가 쪼개졌다. 어댑터·survey는 `nestedByPath`로
 * 고쳤지만 **push→DB 배선이 없어 프로덕션 pull은 옛 동작이었다** — 그 홉을 여기서 본다.
 *
 * chrome 픽스처로는 못 본다 — 그 어댑터는 정의상 flat이라 이 필드를 내지 않는다.
 */
describe("push 흐름 — nestedByPath가 Project까지 간다", () => {
  const MIXED: Record<string, string> = {
    "i18n/en.json": JSON.stringify({ grp: { k: "N" }, "a.b": "X" }, null, 2),
    "i18n/th.json": JSON.stringify({ "Clear workspace": "ล้าง", "Clear workspace.": "ล้าง." }, null, 2),
  };

  async function runMixed() {
    const paths = Object.keys(MIXED);
    const probe = (p: string) => MIXED[p];
    const format = detectFormat(paths, probe);
    expect(format?.adapter, "json-catalog를 탐지해야 한다").toBe("json-catalog");
    const adapter = adapterFor(format!);
    const read = adapter.read(format!, selectLocaleFiles(adapter.layout, format!, paths, probe));
    const payload = buildPushPayload({
      projectSlug: "acme",
      commitSha: "b".repeat(40),
      commitAt: "2026-09-04T00:00:00+09:00",
      format: format!,
      read,
      baseLocale: "en",
      scanRefs: [],
    }).payload;
    const stub = stubPrisma([], payload.keys.map((k) => k.key));
    await applyPush(stub.prisma, PROJECT_ID, payload);
    return { ...stub, payload };
  }

  it("파일별 관측값이 페이로드와 Project 컬럼까지 간다 — 한 홉만 끊겨도 pull이 옛 동작을 한다", async () => {
    const { payload, projectUpdates } = await runMixed();
    // 포맷 단위 값은 여전히 거칠다 — en 하나가 중첩이라 true다.
    expect(payload.format.nested).toBe(true);
    expect(payload.format.nestedByPath).toEqual({ "i18n/en.json": true, "i18n/th.json": false });
    const data = (projectUpdates[0] as { data: Record<string, unknown> }).data;
    expect(data["nestedByPath"]).toEqual({ "i18n/en.json": true, "i18n/th.json": false });
  });
});
