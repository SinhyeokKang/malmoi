import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, detectFormat } from "@/lib/adapters/index";
import { applyPush } from "../apply";
import { buildPushPayload, pickBaseLocale, selectLocaleFiles } from "../payload";
import { sourceHash, type ExistingKey } from "../plan";

/**
 * **push 흐름을 끝에서 끝까지 본다**. 홉마다 단위 테스트가 있어도
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
  /** `$transaction` 호출 수 — 하나여야 한다(원자성). */
  txCount: () => number;
  /** `stringKey.findMany` 호출 수 — 하나여야 한다(id를 재사용하므로 재조회가 없다). */
  keyQueries: () => number;
};

function stubPrisma(existing: readonly ExistingKey[], allKeys: readonly string[]): Stub {
  const captured: Captured[] = [];
  const projectUpdates: unknown[] = [];
  let transactions = 0;
  let keyFindMany = 0;

  const prisma = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]): Captured => {
      const c = { sql: strings.join(" ? "), values };
      captured.push(c);
      return c;
    },
    // 배열형 트랜잭션은 문장 순서대로 영향 행수를 돌려준다.
    $transaction: async (arr: readonly unknown[]) => {
      transactions += 1;
      return arr.map(() => 1);
    },
    stringKey: {
      findMany: async (args: { select: Record<string, boolean> }) => (
        keyFindMany += 1,
        // 첫 호출은 계획용(sourceHash까지), 두 번째는 insert 후 id 조회다.
        args.select["sourceHash"]
          ? existing
          : [...new Set([...existing.map((e) => e.key), ...allKeys])].map((key) => ({ id: `id-${key}`, key }))),
    },
    project: {
      update: async (args: unknown) => {
        projectUpdates.push(args);
        return {};
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    captured,
    projectUpdates,
    txCount: () => transactions,
    keyQueries: () => keyFindMany,
  };
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

/**
 * 키 → 삽입에 쓴 id. **`applyPush`가 id를 조회하지 않고 자기가 만든 값을 재사용하므로** 테스트도
 * 그 관계로 단언한다. 전에는 스텁이 두 번째 조회에 `id-<key>`를 돌려줘 그 합성 값을 박아 뒀는데,
 * 그러면 id의 출처가 바뀌었을 때 무엇이 깨졌는지가 아니라 스텁의 관례가 깨진다.
 */
function keyIdOf(captured: readonly Captured[]): (key: string) => unknown {
  const cols = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'));
  const keys = cols["key"] ?? [];
  const ids = cols["id"] ?? [];
  return (key: string) => ids[keys.indexOf(key)];
}

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
  /** 페이로드의 로케일 목록을 덮는다 — 생산자가 안 내는 모양(중복)을 `applyPush`에 먹여 볼 때. */
  locales?: string[];
  /**
   * 이 push **전의** `Project.baseLocale`. 기본은 페이로드의 base와 같다(= base 교체가 아니다) —
   * 기존 케이스 전부가 그 상황이고, base 교체는 아래 별도 describe가 명시적으로 다르게 준다 (6b-3).
   */
  previousBaseLocale?: string | null;
} = {}) {
  const built = payloadFromFiles(options.scanRefs ?? []);
  const payload = options.locales === undefined ? built : { ...built, locales: options.locales };
  const stub = stubPrisma(options.existing ?? [], payload.keys.map((k) => k.key));
  const outcome = await applyPush(stub.prisma, PROJECT_ID, payload, {
    previousBaseLocale:
      options.previousBaseLocale === undefined ? payload.format.baseLocale : options.previousBaseLocale,
  });
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

    const idOf = keyIdOf(captured);
    expect(rows).toEqual([
      { keyId: idOf("apple"), locale: "en", value: "Apple", description: null, placeholders: '{"u":{"content":"$1"}}' },
      // base 파일의 description은 **키 메타데이터이면서 그 로케일 파일이 실제로 가진 값**이라
      // 양쪽에 실린다. 합치는 것이 아니다 — 두 축이 우연히 같은 출처를 가질 뿐이다.
      { keyId: idOf("zebra"), locale: "en", value: "Zebra", description: "동물", placeholders: null },
      { keyId: idOf("apple"), locale: "ko", value: "사과", description: "ko쪽 설명", placeholders: null },
      { keyId: idOf("zebra"), locale: "ko", value: "얼룩말", description: null, placeholders: null },
    ]);
  });

  it("빈 값 번역은 실리지 않지만 키는 남는다 — 번역이 없는 것과 키가 없는 것은 다르다", async () => {
    const { captured } = await runFlow();
    expect(columnsOf(stmt(captured, 'INSERT INTO "StringKey"'))["key"]).toContain("empty");
    expect(columnsOf(stmt(captured, 'INSERT INTO "Translation"'))["value"]).not.toContain("");
  });

  /**
   * **덮인 값의 저자는 리포다** (translation-ui design §3.6). strict 덮어쓰기에서 사람 이름이 남으면
   * 거짓이고, 미배포 집계(isUnpublished)가 push 직후 **전 키를** "안 보낸 편집"으로 센다 —
   * 903키 프로젝트에서 배너가 매번 뜬다.
   */
  it("push는 updatedBy를 비운다 — ON CONFLICT에서 NULL로 덮는다", async () => {
    const { captured } = await runFlow();
    expect(stmt(captured, 'INSERT INTO "Translation"').sql).toMatch(/"updatedBy"\s*=\s*NULL/);
  });

  it("base 로케일도 Translation 행을 갖는다 — base도 편집 대상이다", async () => {
    const { captured } = await runFlow();
    expect(columnsOf(stmt(captured, 'INSERT INTO "Translation"'))["localeCode"]).toContain("en");
  });

  it("중복 로케일은 한 행으로 접는다 — 같은 문장이 같은 행을 두 번 치면 트랜잭션 전체가 거부된다 (2026-09-04 audit #13)", async () => {
    const { captured } = await runFlow({ locales: ["en", "ko", "ko"] });
    const cols = columnsOf(stmt(captured, 'INSERT INTO "Locale"'));
    expect(cols["code"]).toEqual(["en", "ko"]);
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
    const apple = keyIdOf(captured)("apple");
    expect(cols["keyId"]).toEqual([apple, apple]);
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

  /**
   * **선언은 그것을 쓴 push만 비운다** (6b-3 회귀 — code-review 2026-09-09 🔴1).
   *
   * 처음 구현은 push마다 `declaredBaseLocale: null`을 실었다. 그러면 OWNER가 base를 선언한 뒤
   * **워크플로를 고치기 전에 평범한 CI push 한 번**이 오면(base 브랜치에 머지가 있을 때마다 온다)
   * 그 허가가 조용히 사라지고 **두 화면의 대기 배너도 함께 사라진다** — OWNER는 변경이 반영된 줄
   * 알지만 아무것도 안 바뀌었다. 흔한 경로에서 기능이 무력화되고 신호가 없다.
   *
   * `baseChanged`가 곧 "허가가 쓰였다"다: `checkFormat`이 payload의 base를 현실 또는 선언으로만
   * 통과시키므로, 현실과 다른 base가 여기까지 왔다면 그것은 선언과 같은 값이다.
   */
  it("base가 그대로인 push는 선언을 건드리지 않는다 — 허가를 쓰지 않았다", async () => {
    const { projectUpdates } = await runFlow();
    const data = (projectUpdates[0] as { data: Record<string, unknown> }).data;
    expect(Object.hasOwn(data, "declaredBaseLocale")).toBe(false);
  });

  it("base를 바꾸는 push는 선언을 비운다 — 일회용이다", async () => {
    const { projectUpdates } = await runFlow({ previousBaseLocale: "ko" });
    const data = (projectUpdates[0] as { data: Record<string, unknown> }).data;
    expect(data["declaredBaseLocale"]).toBeNull();
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
        // ⚠️ `declaredBaseLocale`이 **없다** — base가 안 바뀐 push는 허가를 쓰지 않았다 (위 두 케이스).
        lastCommitSha: "a".repeat(40),
        lastCommitAt: new Date("2026-09-03T00:00:00+09:00"),
        // 임포트 결과도 **같은 문장**에 실린다 (projects-list design §3.35) — 뒤에 따로 쓰면
        // 데이터는 들어갔는데 목록만 실패로 남는 창이 생긴다.
        lastImportError: null,
        lastImportStartedAt: null,
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
    // ⚠️ 로케일 orphan 문장도 `"orphaned" = true`를 담으므로 테이블까지 적어 좁힌다.
    const orphan = stmt(captured, 'UPDATE "StringKey" SET "orphaned" = true');
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

  /**
   * **base 교체 push는 `needsReview`를 한 행도 세우지 않는다** (6b-3 — design §3.13).
   *
   * ⚠️ 이 케이스가 다른 것과 갈리는 지점은 **원인**이다. `sourceHash`가 전부 달라지지만 그 변화의
   * 뜻이 "원문 문장이 수정됐다"가 아니라 "원문의 **언어**가 교체됐다"라 다른 로케일의 번역은
   * 여전히 정확하다. 전파하면 살아남는 키 전부에 검토 표시가 붙어 `needsReview` 필터가 죽는다.
   */
  it("base가 바뀌는 push에서는 needsReview 문장이 아예 없다", async () => {
    const changed: ExistingKey = { ...existingZebra, sourceHash: sourceHash("옛 base의 원문") };
    // 옛 base가 ko였고 이번 push가 en으로 온다 — 픽스처의 base가 en이다.
    const { captured } = await runFlow({ existing: [changed], previousBaseLocale: "ko" });
    expect(has(captured, '"needsReview" = true')).toBe(false);
    // **전파만 끈다** — 원문 갱신은 그대로 일어난다.
    expect(stmt(captured, 'UPDATE "StringKey" AS s').sql).toContain('"sourceHash" = v."sourceHash"');
  });

  /** 첫 push는 base 교체가 아니다 — 비교 대상이 없고 기존 키도 없다 (`isBaseLocaleChange`). */
  it("옛 base가 null이면(첫 push) 옛 동작 그대로다", async () => {
    const changed: ExistingKey = { ...existingZebra, sourceHash: sourceHash("옛날 원문") };
    const { captured } = await runFlow({ existing: [changed], previousBaseLocale: null });
    expect(stmt(captured, '"needsReview" = true').values).toContainEqual(["id-zebra"]);
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
    await applyPush(stub.prisma, PROJECT_ID, payload, { previousBaseLocale: payload.format.baseLocale });
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

/**
 * **원자성** (2026-09-04 audit #1). 전에는 트랜잭션이 둘이었다 — 키 id를 확보하려고 중간에
 * `findMany`를 한 번 더 쳤기 때문이다. 두 번째가 실패하면 키·orphaned·needsReview만 새 상태이고
 * 번역·refs·`Project.lastCommit*`은 옛 상태인 혼합 DB가 남는다. 삽입 id는 이미 JS에서 만들므로
 * (`randomUUID`) 그 값을 들고 있으면 조회가 필요 없다.
 */
describe("push 흐름 — 원자성", () => {
  it("트랜잭션이 하나다 — 둘로 나누면 두 번째 실패가 혼합 상태를 남긴다", async () => {
    const { txCount } = await runFlow();
    expect(txCount()).toBe(1);
  });

  it("키 조회가 한 번이다 — id는 삽입에 쓴 값을 그대로 재사용한다", async () => {
    const { keyQueries } = await runFlow();
    expect(keyQueries()).toBe(1);
  });

  it("Translation의 keyId가 StringKey INSERT의 id와 같다 — 조회 없이 맞아야 한다", async () => {
    const { captured } = await runFlow();
    const inserted = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'))["id"] ?? [];
    const used = new Set(columnsOf(stmt(captured, 'INSERT INTO "Translation"'))["keyId"] ?? []);
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) expect(inserted).toContain(id);
  });
});

/**
 * **중복 평탄화 키** (2026-09-04 audit #1의 재현 경로). `json-catalog`의 `flatten`은 중복을
 * 검사하지 않아 `{"a.b": …, "a": {"b": …}}`가 같은 키를 두 번 낸다. 그 쌍이 한 INSERT에 들어가면
 * Postgres가 `ON CONFLICT DO UPDATE cannot affect row a second time`으로 거부한다 —
 * 지원 포맷 리포가 push를 아예 못 끝낸다.
 */
describe("push 흐름 — 중복 키를 페이로드가 접는다", () => {
  it("같은 로케일에 같은 키가 두 번 오면 한 행만 쓴다", async () => {
    const payload = payloadFromFiles();
    const first = payload.translations[0]!;
    const dup = { ...first, value: "나중 값이 이긴다" };
    const stub = stubPrisma([], payload.keys.map((k) => k.key));
    await applyPush(stub.prisma, PROJECT_ID, { ...payload, translations: [...payload.translations, dup] }, {
      previousBaseLocale: payload.format.baseLocale,
    });
    const cols = columnsOf(stmt(stub.captured, 'INSERT INTO "Translation"'));
    const pairs = (cols["keyId"] ?? []).map((id, i) => `${String(id)}|${String((cols["localeCode"] ?? [])[i])}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

/**
 * **삭제된 로케일** (2026-09-04 audit #2). 로케일 목록의 정본은 어댑터가 탐지한 파일 목록이다
 * (ARCHITECTURE §0 불변식 2). 사라진 로케일을 표시하지 않으면 DB에 영구 잔존하고, pull이 그 로케일 파일을
 * **되살린다** — 개발자가 지운 파일이 다음 PR에서 돌아온다.
 */
describe("push 흐름 — 사라진 로케일을 orphaned로 표시한다", () => {
  it("페이로드에 있는 로케일은 orphaned를 되돌린다 — 파일이 돌아오면 살아난다", async () => {
    const { captured } = await runFlow();
    expect(stmt(captured, 'INSERT INTO "Locale"').sql).toMatch(/"orphaned"\s*=\s*false/);
  });

  it("페이로드에 없는 로케일을 표시하고 isBase를 내린다 — base가 둘이면 편집 UI가 사라진 로케일을 base로 세운다", async () => {
    const { captured } = await runFlow();
    const s = stmt(captured, 'UPDATE "Locale"');
    expect(s.sql).toMatch(/"orphaned"\s*=\s*true/);
    expect(s.sql).toMatch(/"isBase"\s*=\s*false/);
    // 남길 로케일 목록이 인자로 간다 — 그 목록 밖이 표시 대상이다.
    expect(s.values).toContainEqual(["en", "ko"]);
  });

  it("로케일 목록이 비면 표시 문장을 내지 않는다 — 전체를 orphan시키는 사고가 된다", async () => {
    const payload = payloadFromFiles();
    const stub = stubPrisma([], payload.keys.map((k) => k.key));
    await applyPush(stub.prisma, PROJECT_ID, { ...payload, locales: [] }, {
      previousBaseLocale: payload.format.baseLocale,
    });
    expect(has(stub.captured, 'UPDATE "Locale"')).toBe(false);
  });
});

/**
 * **키 생성 시각과 임포트 결과** (projects-list design §3.35·§8).
 *
 * 둘 다 `applyPush`의 **같은 트랜잭션**에 실린다. 결과를 뒤에 따로 쓰면 데이터는 들어갔는데 목록만
 * 실패로 남는 창이 생기고, 그 창에서 사용자가 보는 것은 "적재가 깨졌다"인데 실제로는 끝난 상태다.
 */
describe("push 흐름 — 키 생성 시각과 임포트 결과", () => {
  const run = async (importOutcome: "partial-import" | null = null) => {
    const payload = payloadFromFiles();
    const stub = stubPrisma([], payload.keys.map((k) => k.key));
    await applyPush(stub.prisma, PROJECT_ID, payload, {
      previousBaseLocale: payload.format.baseLocale,
      importOutcome,
    });
    return stub;
  };

  it("신규 키 INSERT가 createdAt을 싣는다 — 목록의 `New from GitHub`가 이 값을 센다", async () => {
    const { captured } = await run();
    const cols = columnsOf(stmt(captured, 'INSERT INTO "StringKey"'));
    expect(Object.keys(cols)).toContain("createdAt");
    expect(cols["createdAt"]?.length).toBe(cols["key"]?.length);
  });

  /**
   * ⚠️ **UPDATE가 건드리면 살아 돌아온 키가 매번 "새 키"로 잡힌다.** orphan 복구는 같은 문장이 하므로
   * 이 단언이 그 갈래까지 덮는다.
   */
  it("기존 키 UPDATE는 createdAt을 쓰지 않는다", async () => {
    const payload = payloadFromFiles();
    const existing = payload.keys.map((k) => ({ key: k.key, id: `id-${k.key}`, sourceHash: "stale", orphaned: false }));
    const stub = stubPrisma(existing as never, payload.keys.map((k) => k.key));
    await applyPush(stub.prisma, PROJECT_ID, payload, { previousBaseLocale: payload.format.baseLocale });
    expect(stmt(stub.captured, 'UPDATE "StringKey" AS s').sql).not.toContain("createdAt");
  });

  it("완전 성공이 이전 실패와 진행 표시를 같이 비운다", async () => {
    const { projectUpdates } = await run(null);
    expect(projectUpdates[0]).toMatchObject({
      data: expect.objectContaining({ lastImportError: null, lastImportStartedAt: null }),
    });
  });

  it("부분 실패는 코드를 남기고 진행 표시만 비운다 — 데이터는 이미 들어갔다", async () => {
    const { projectUpdates } = await run("partial-import");
    expect(projectUpdates[0]).toMatchObject({
      data: expect.objectContaining({ lastImportError: "partial-import", lastImportStartedAt: null }),
    });
  });

  it("트랜잭션은 여전히 하나다 — 결과 표시가 별도 왕복이 되면 그 창이 생긴다", async () => {
    const { txCount } = await run("partial-import");
    expect(txCount()).toBe(1);
  });
});
