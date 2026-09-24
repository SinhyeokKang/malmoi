import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { detectFormat } from "@/lib/adapters";
import type { DetectedFormat } from "@/lib/adapters/types";

import { ingestFirstSnapshot, prepareFirstSnapshot } from "../ingest";

/**
 * 서버측 첫 적재 (ARCHITECTURE §3.1). **기존 경로를 그대로 지난다** — `assemblePushInput` → `buildPushPayload` →
 * `applyPush`. 셋을 우회하면 CI가 올린 것과 온보딩이 올린 것이 달라진다 (POSTMORTEM 2026-08-31: 페이로드를
 * 리터럴로 조립했다가 필수 필드가 늘어도 컴파일러가 침묵했다 / 2026-09-02: 껍데기가 파일을 안 골라 어댑터가
 * "존재하지 않았다").
 *
 * ⚠️ **GitHub을 모른다.** 스냅샷과 blob은 **값으로** 받는다 — `credential-separation.test.ts`가 그 경계를
 * 소스에서 상시로 센다.
 *
 * ⚠️ **`commitAt`이 base head 커밋의 시각이어야 한다.** `new Date()`를 쓰면 그 시각이 커밋보다 미래라
 * **CI의 첫 push가 `stale-commit` 409로 거부된다** (`checkCommitOrder`는 동일 시각만 통과시킨다).
 */

const TREE: Record<string, string> = {
  "src/locales/en.json": '{\n  "a.greet": "Hello",\n  "a.bye": "Bye"\n}\n',
  "src/locales/ko.json": '{\n  "a.greet": "안녕",\n  "a.bye": "잘 가"\n}\n',
  "README.md": "# repo\n",
};
const PATHS = Object.keys(TREE);
const HEAD_SHA = "c".repeat(40);
const HEAD_AT = "2026-09-01T10:00:00+09:00";

function format(): DetectedFormat {
  const found = detectFormat(PATHS, (p) => TREE[p]);
  if (!found) throw new Error("픽스처가 탐지되지 않는다");
  return found;
}

type Captured = { sql: string; values: unknown[] };

/**
 * `lib/push/__tests__/flow.test.ts`의 스텁과 같은 형이다 — 대화형 `$transaction`을 지원하고 SQL 인자를
 * 캡처한다. `applyPush`를 mock하지 않는 이유: **그 함수를 실제로 지나는지**가 이 테스트의 요지다.
 */
function stubPrisma() {
  const captured: Captured[] = [];
  const projectUpdates: unknown[] = [];
  const prisma = {
    project: { findUnique: async () => ({ slug: "acme", archivedAt: null }) },
    // 적재 트랜잭션이 잠금 뒤 호출자 권한을 다시 본다 (감사 #9).
    projectMember: { findUnique: async () => ({ projectId: "p1", role: "OWNER" }) },
    locale: { findFirst: async () => null },
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const c = { sql: strings.join(" ? "), values };
      captured.push(c);
      return Promise.resolve(1);
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(prisma),
    stringKey: {
      findMany: async (args: { select: Record<string, boolean> }) =>
        args.select["sourceHash"] ? [] : [],
    },
    translationSurface: {
      findUnique: async () => ({ slug: "default", archivedAt: null, adapterName: null, pathTemplate: null, baseLocale: null, declaredBaseLocale: null, lastCommitAt: null }),
      findFirst: async () => ({ archivedAt: null }),
      updateMany: async () => ({ count: 1 }),
      update: async (args: unknown) => {
        projectUpdates.push(args);
        return {};
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, captured, projectUpdates };
}

const run = (over: Partial<Parameters<typeof ingestFirstSnapshot>[1]> = {}) => {
  const stub = stubPrisma();
  return {
    stub,
    result: ingestFirstSnapshot(stub.prisma, {
      projectId: "p1", surfaceId: "s1", userId: "owner",
      token: "fixture-run", startedAt: new Date("2026-09-13T00:00:00Z"),
      projectSlug: "acme",
      surfaceSlug: "default",
      // 내려받기를 시도한 경로. 여기 있는데 `blobs`에 없으면 **실패**다 — "리포에 없음"과 구별한다.
      targets: PATHS.filter((p) => p.startsWith("src/locales/")),
      format: format(),
      baseLocale: "en",
      headSha: HEAD_SHA,
      headCommittedAt: HEAD_AT,
      paths: PATHS,
      blobs: new Map(Object.entries(TREE)),
      ...over,
    }),
  };
};

const columnsOf = (c: Captured): Record<string, unknown[]> => {
  const m = /AS v\(([^)]*)\)/.exec(c.sql) ?? /INSERT INTO "[A-Za-z]+" \(([^)]*)\)/.exec(c.sql);
  const names = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/"/g, ""));
  const arrays = c.values.filter((v): v is unknown[] => Array.isArray(v));
  return Object.fromEntries(names.map((n, i) => [n, arrays[i] ?? []]));
};

describe("ingestFirstSnapshot — 기존 경로를 그대로 지난다", () => {
  it("base 로케일의 키가 `StringKey` 삽입에 실린다", async () => {
    const { stub, result } = run();
    await result;
    const insert = stub.captured.find((c) => c.sql.includes('INSERT INTO "StringKey"'));
    expect(insert).toBeDefined();
    expect((columnsOf(insert!)["key"] ?? []).sort()).toEqual(["a.bye", "a.greet"]);
  });

  it("번역은 base가 아닌 로케일도 함께 실린다 — base도 편집 가능하다", async () => {
    const { stub, result } = run();
    await result;
    const insert = stub.captured.find((c) => c.sql.includes('"Translation"'));
    expect(insert).toBeDefined();
    const locales = new Set(columnsOf(insert!)["localeCode"] ?? []);
    expect([...locales].sort()).toEqual(["en", "ko"]);
  });

  it("⚠️ `commitAt`이 base head 커밋 시각이다 — `new Date()`면 CI 첫 push가 409다", async () => {
    const { stub, result } = run();
    await result;
    const update = stub.projectUpdates[0] as { data: { lastCommitAt: Date; lastCommitSha: string } };
    expect(update.data.lastCommitSha).toBe(HEAD_SHA);
    expect(update.data.lastCommitAt.toISOString()).toBe(new Date(HEAD_AT).toISOString());
  });

  it("refs가 0건이다 — 서버는 리포를 체크아웃하지 않아 ts-morph를 돌릴 수 없다", async () => {
    const { stub, result } = run();
    await result;
    const refInsert = stub.captured.find((c) => c.sql.includes('"KeyRef"'));
    // refs가 비면 삽입 문장 자체가 없거나 빈 배열이다 — 둘 다 "참조 없음"이다.
    if (refInsert) expect(columnsOf(refInsert)["key"] ?? []).toEqual([]);
    expect((await run().result).count).toBeGreaterThan(0);
  });
});

describe("ingestFirstSnapshot — 반환값", () => {
  it("적재한 키 수를 돌려준다", async () => {
    expect((await run().result).count).toBe(2);
  });

  it("read 에러가 `failed`에 실린다 — 후보를 떨어뜨리지 않고 화면이 그 수를 말한다 (불변식 9)", async () => {
    const broken = new Map(Object.entries({ ...TREE, "src/locales/ko.json": "{ not json" }));
    const out = await run({ blobs: broken }).result;
    expect(out.failed).toBeGreaterThan(0);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("중복 평탄화 키도 `failed`에 들어간다 — 조용히 버리면 값이 왜 사라졌는지 알 수 없다", async () => {
    // `{"a": {"b": …}, "a.b": …}`가 같은 평탄화 키를 두 번 낸다 (ARCHITECTURE §1.35).
    const dup = new Map(
      Object.entries({
        "src/locales/en.json": '{\n  "a": { "b": "one" },\n  "a.b": "two"\n}\n',
        "src/locales/ko.json": '{\n  "a": { "b": "하나" },\n  "a.b": "둘"\n}\n',
      }),
    );
    const out = await run({ blobs: dup, paths: [...dup.keys()] }).result;
    expect(out.failed).toBeGreaterThan(0);
  });

  it("실패가 0이면 `failed`가 0이다", async () => {
    expect((await run().result).failed).toBe(0);
  });
});

describe("ingestFirstSnapshot — 경계", () => {
  it("blob이 없는 로케일 파일은 넘기지 않는다 — 빈 내용을 먹이면 그 로케일의 키를 잃는다", async () => {
    const partial = new Map([["src/locales/en.json", TREE["src/locales/en.json"]!]]);
    const { stub, result } = run({ blobs: partial, targets: ["src/locales/en.json"] });
    await result;
    const insert = stub.captured.find((c) => c.sql.includes('"Translation"'));
    const locales = new Set(columnsOf(insert!)["localeCode"] ?? []);
    expect([...locales]).toEqual(["en"]);
  });

  it("⚠️ **내려받지 못한 로케일 파일이 `failed`에 잡힌다** — 성공 문구로 나가면 안 된다 (불변식 9)", async () => {
    // code-review 2026-09-07 🔴1: "다운로드 실패"와 "리포에 없음"을 같게 접으면 화면이 "N개 키를
    // 적재했어요"를 쓴다. 로케일 12개 중 3개가 5xx면 DB엔 9개만 들어가는데 사용자는 성공으로 읽고
    // [다시 시도]를 누르지 않는다.
    const partial = new Map([["src/locales/en.json", TREE["src/locales/en.json"]!]]);
    const out = await run({ blobs: partial }).result;
    expect(out.failed).toBeGreaterThan(0);
    expect(out.errors.some((e) => e.path === "src/locales/ko.json")).toBe(true);
  });

  it("base 파일 자체를 못 받으면 `count: 0`이 성공으로 읽히지 않는다", async () => {
    const onlyKo = new Map([["src/locales/ko.json", TREE["src/locales/ko.json"]!]]);
    const out = await run({ blobs: onlyKo }).result;
    expect(out.count).toBe(0);
    expect(out.failed).toBeGreaterThan(0);
  });

  it("GitHub을 부르지 않는다 — 스냅샷·blob은 값으로 받는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await run().result;
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

it("첫 적재도 API의 번역 길이 상한을 넘어 DB에 쓰지 않는다", async () => {
  const { stub, result } = run({ blobs: new Map([["src/locales/en.json", JSON.stringify({ hello: "x".repeat(10001) })], ["src/locales/ko.json", '{"hello":"안녕"}']]) });
  await expect(result).rejects.toThrow();
  expect(stub.captured).toHaveLength(0);
});

/**
 * **관리하지 않는 항목은 실패가 아니다** (B2 r3 — QA5). ts-dict의 `String(…)` 값은 malmoi가 일부러 안 다루는 항목이고
 * 수술적 writer가 파일에 그대로 남긴다 — 그것 하나로 적재가 `partial`이 되면 소스 전체가 "Last sync failed"다.
 * 대조로 진짜 실패(재생성 어댑터가 잃는 값 · 다운로드 실패)는 그대로 `failed`에 센다 (POSTMORTEM 2026-09-14).
 */
describe("prepareFirstSnapshot — 관리하지 않는 항목과 실패를 가른다", () => {
  const base = { projectId: "p1", surfaceId: "s1", surfaceSlug: "default", token: "t", startedAt: new Date("2026-09-13T00:00:00Z"),
    projectSlug: "acme", headSha: HEAD_SHA, headCommittedAt: HEAD_AT };
  const TS: Record<string, string> = {
    "src/i18n/namespaces/common.ts": 'const ko = {\n  "a": "가",\n  "b": String(1),\n} as const;\n\nconst en = {\n  "a": "A",\n  "b": "B",\n} as const;\n\nexport const common = { ko, en };\n',
  };
  const tsFormat = (): DetectedFormat => {
    const found = detectFormat(Object.keys(TS), p => TS[p]);
    if (!found) throw new Error("ts-dict 픽스처가 탐지되지 않는다");
    return found;
  };

  it("ts-dict의 비리터럴 값은 failed가 아니라 unmanaged로 센다", () => {
    const { result } = prepareFirstSnapshot({ ...base, format: tsFormat(), baseLocale: "en", paths: Object.keys(TS), targets: Object.keys(TS), blobs: new Map(Object.entries(TS)) });
    expect(result).toMatchObject({ count: 2, failed: 0, unmanaged: 1 });
    expect(result.errors).toEqual([]);
  });

  it("대조: 같은 픽스처에서 파일 하나를 못 받으면 여전히 failed다", () => {
    const paths = [...Object.keys(TS), "src/i18n/namespaces/other.ts"];
    const { result } = prepareFirstSnapshot({ ...base, format: tsFormat(), baseLocale: "en", paths, targets: paths, blobs: new Map(Object.entries(TS)) });
    expect(result.failed).toBe(1);
    expect(result.unmanaged).toBe(1);
    expect(result.errors.map(e => e.code)).toEqual(["download-failed"]);
  });

  /** code-dict의 중복 프로퍼티는 경고다(B7a r1 사용자 결정) — failed도 unmanaged도 아니다. 마지막 값이 적재된다. */
  it("code-dict의 중복 프로퍼티는 failed·unmanaged 어느 쪽에도 세지 않는다", () => {
    const CODE: Record<string, string> = {
      "src/locale/en.ts": "export default {\n  a: 'first',\n  b: 'B',\n  a: 'A',\n}\n",
      "src/locale/ko.ts": "export default {\n  a: '가',\n  b: '나',\n}\n",
    };
    const found = detectFormat(Object.keys(CODE), p => CODE[p]);
    expect(found?.adapter).toBe("code-dict");
    const { payload, result } = prepareFirstSnapshot({ ...base, format: found!, baseLocale: "en", paths: Object.keys(CODE), targets: Object.keys(CODE), blobs: new Map(Object.entries(CODE)) });
    expect(result).toMatchObject({ count: 2, failed: 0, unmanaged: 0, errors: [] });
    expect(payload?.translations).toContainEqual(expect.objectContaining({ locale: "en", key: "a", value: "A" }));
  });

  it("대조: json-catalog의 숫자 값은 다음 Publish에서 지워지므로 failed다", () => {
    const tree = { ...TREE, "src/locales/ko.json": '{\n  "a.greet": "안녕",\n  "a.bye": 3\n}\n' };
    const { result } = prepareFirstSnapshot({ ...base, format: format(), baseLocale: "en", paths: PATHS, targets: PATHS.filter(p => p.startsWith("src/locales/")), blobs: new Map(Object.entries(tree)) });
    expect(result.failed).toBe(1);
    expect(result.unmanaged).toBe(0);
  });
});
