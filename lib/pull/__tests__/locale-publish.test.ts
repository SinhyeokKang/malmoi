import { describe, expect, it, vi } from "vitest";

import { blobSha } from "@/lib/githash";
import { publishFingerprint } from "@/lib/publish/fingerprint";
import { NO_LOCALE_PLAN, afterExpiry, expiringLocalesOf, expiryCheckApplies, localeNotesOf, planProjectLocales, localeWorkOf, observedLocalesOf, withdrawnLocalesOf, type ProjectLocalePlan, type SurfaceLocaleChanges } from "../locales";
import { reachedRepository } from "@/lib/locales/reached";
import { pullRequestBody, removedFilesStated } from "../payload";
import { shouldSkipPull } from "../plan";
import { LocalePlanRefused, projectFormats, renderProject, runPull, type PullDeps, type PullState } from "../run";
import { classifySyncError } from "@/lib/sync/plan";
import type { RenderKey } from "../render";
import { createFakeGitClient, isGitMutation, type FakeGitOptions } from "./fake-client";

/**
 * **언어 변경의 Publish** (locale-add design §4 "추가 렌더와 제거/취소 Publish" · tasks §5 셋째~열째).
 *
 * 순수 오케스트레이션 층 — fake 클라이언트와 손으로 만든 `PullState`로 잰다. DB 쪽(캡처 목록을 확인 tx가 쓰는가)은
 * `locale-publish.integration.ts`가 진입점부터 잰다.
 */

const PROJECT = {
  id: "p1", slug: "fixture", repoOwner: "o", repoName: "r", baseBranch: "dev",
  repoHost: "github", gitlabConnectionId: null, installationId: "123", repositoryId: "456",
  adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en",
  lastPulledAt: null as Date | null,
};

const EN = '{\n    "a": "A",\n    "b": "B"\n}\n';
const KO = '{\n    "a": "가",\n    "b": "나"\n}\n';
const FR = '{\n    "a": "Ah"\n}\n';

const KEYS: RenderKey[] = [
  { id: "ka", key: "a", sourceText: "A", orphaned: false, cells: { en: { value: "A" }, ko: { value: "가" }, fr: { value: "Ah" }, de: { value: "Ä" } } },
  { id: "kb", key: "b", sourceText: "B", orphaned: false, cells: { en: { value: "B" }, ko: { value: "나" } } },
];

const at = new Date("2026-10-14T00:00:00Z");
const changes = (rows: [string, "ADD" | "REMOVE"][], delivered: SurfaceLocaleChanges["delivered"] = [], counts: [string, number][] = []): SurfaceLocaleChanges => ({
  rows: rows.map(([localeCode, operation]) => ({ localeCode, operation, requestedAt: at })),
  valueCounts: new Map(counts),
  delivered,
  // 테스트 입력의 작업 수 — 실제 값은 로더가 `localeWork`로 센다.
  work: rows.length,
});

function state(over: { localeCodes?: string[]; localeChanges?: SurfaceLocaleChanges; unpublished?: number; maxUpdatedAt?: Date | null; pendingEdits?: PullState["pendingEdits"] } = {}): PullState {
  return {
    project: { ...PROJECT },
    surfaces: [{ ...PROJECT, id: "s1", slug: "default", localeCodes: over.localeCodes ?? ["en", "ko"], keys: KEYS,
      ...(over.localeChanges === undefined ? {} : { localeChanges: over.localeChanges }) }],
    maxUpdatedAt: over.maxUpdatedAt === undefined ? new Date("2026-10-13T00:00:00Z") : over.maxUpdatedAt,
    unpublished: over.unpublished ?? 0,
    pendingEdits: over.pendingEdits ?? [],
    deliveryContexts: [{ surfaceId: "s1", fingerprint: "ctx" }],
  };
}

const tree = (files: Record<string, string>) => Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) }));
const blobs = (files: Record<string, string>) => Object.fromEntries(Object.values(files).map(content => [blobSha(content), content]));
function fake(files: Record<string, string>, extra: Partial<FakeGitOptions> = {}) {
  return createFakeGitClient({ refSha: { "heads/dev": "basehead" }, tree: { basehead: tree(files) }, blobs: blobs(files), ...extra });
}

function deps(loaded: PullState, made: ReturnType<typeof fake>, over: Partial<PullDeps> = {}) {
  const saveLastPulledAt = vi.fn<PullDeps["saveLastPulledAt"]>(async () => {});
  const invalidateDelivery = vi.fn<PullDeps["invalidateDelivery"]>(async () => {});
  const value: PullDeps = { loadState: async () => loaded, createClient: async () => made.client, saveLastPulledAt, invalidateDelivery, syncBranch: "malmoi-i18n/sync-fixture", ...over };
  return { deps: value, saveLastPulledAt, invalidateDelivery };
}

const snapshotOf = (made: ReturnType<typeof fake>) => made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: { kind: string; path: string; inBase?: boolean; content?: string }[] } | undefined;

describe("shouldSkipPull — 셀 편집 0 그리고 언어 작업 0일 때만 (design §4 조기 종료 ①)", () => {
  it.each([[0, 0, true], [1, 0, false], [0, 1, false], [2, 3, false]])("편집 %i · 언어 작업 %i → %s", (edits, work, skip) => {
    expect(shouldSkipPull(edits, work)).toBe(skip);
  });
  it("언어 작업을 안 주면 옛 판정 그대로다", () => {
    expect(shouldSkipPull(0)).toBe(true);
    expect(shouldSkipPull(1)).toBe(false);
  });
});

describe("planProjectLocales — 의도 × base 트리 (design §2·§4)", () => {
  const formats = (localeChanges: SurfaceLocaleChanges, localeCodes = ["en", "ko"]) =>
    projectFormats([{ ...PROJECT, id: "s1", slug: "default", localeCodes, keys: KEYS, localeChanges }]);
  const entries = (paths: string[], mode = "100644") => paths.map(path => ({ path, sha: path, mode }));

  it("REMOVE 경로가 base에 있으면 delete, 렌더에서 뺀다", () => {
    const plan = planProjectLocales(formats(changes([["ko", "REMOVE"]])), entries(["i18n/en.json", "i18n/ko.json"]));
    expect(plan).toMatchObject({ ok: true, plan: { surfaces: [{ surfaceId: "s1", exclude: ["ko"], deletes: [{ localeCode: "ko", path: "i18n/ko.json" }], captured: [{ localeCode: "ko", effect: "delete" }] }] } });
  });

  it("REMOVE 경로가 base에 없으면 delete 0 — 효과는 그대로 캡처한다", () => {
    const plan = planProjectLocales(formats(changes([["ko", "REMOVE"]])), entries(["i18n/en.json"]));
    expect(plan).toMatchObject({ ok: true, plan: { surfaces: [{ deletes: [], captured: [{ localeCode: "ko", effect: "delete" }] }] } });
  });

  it("값 있는 ADD는 create, 값 0개 ADD는 파일을 내지 않는다", () => {
    const plan = planProjectLocales(formats(changes([["fr", "ADD"], ["de", "ADD"]], [], [["fr", 1]]), ["en", "ko", "fr", "de"]), entries(["i18n/en.json", "i18n/ko.json"]));
    expect(plan).toMatchObject({ ok: true, plan: { surfaces: [{ exclude: ["de"], creates: [{ localeCode: "fr", path: "i18n/fr.json" }], empty: ["de"] }] } });
    // 화면이 빈 추가를 그 파일 행(`Not included`)으로 말한다(시안 P1 ③) — 경로는 같은 템플릿 판정에서 온다.
    expect(plan.ok && localeNotesOf(plan.plan)).toEqual({ withheld: [], empty: [{ surfaceSlug: "default", localeCode: "de", path: "i18n/de.json" }] });
  });

  it("미전달 ADD의 경로가 base에 이미 있으면 그 언어만 보류한다(proposal-path-exists)", () => {
    const plan = planProjectLocales(formats(changes([["fr", "ADD"]], [], [["fr", 1]]), ["en", "ko", "fr"]), entries(["i18n/en.json", "i18n/ko.json", "i18n/fr.json"]));
    expect(plan).toMatchObject({ ok: true, plan: { surfaces: [{ exclude: ["fr"], withheld: [{ localeCode: "fr", path: "i18n/fr.json", reason: "proposal-path-exists" }], captured: [] }] } });
  });

  it("비정규 파일(링크·서브모듈·디렉터리)을 지우는 계획은 거부한다 — 모드를 싣는다", () => {
    for (const mode of ["120000", "160000", "040000"]) {
      const plan = planProjectLocales(formats(changes([["ko", "REMOVE"]])), [...entries(["i18n/en.json"]), ...entries(["i18n/ko.json"], mode)]);
      expect(plan).toEqual({ ok: false, error: "irregular-file", path: "i18n/ko.json", mode });
    }
  });

  it("다른 소스가 쥔 경로는 만들지도 지우지도 않는다", () => {
    const surfaces = [
      { ...PROJECT, id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS, localeChanges: changes([["ko", "REMOVE"]]) },
      { ...PROJECT, id: "s2", slug: "other", pathTemplate: "i18n/{locale}.json", localeCodes: ["en", "ko"], keys: KEYS },
    ];
    expect(planProjectLocales(projectFormats(surfaces), entries(["i18n/en.json", "i18n/ko.json"]))).toMatchObject({ ok: false, error: "path-conflict", path: "i18n/ko.json" });
  });

  it("행이 없는 소스는 계획에 없다 — 기존 순서를 바꾸지 않는다", () => {
    const plan = planProjectLocales(projectFormats([{ ...PROJECT, id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: KEYS }]), entries(["i18n/en.json"]));
    expect(plan).toEqual({ ok: true, plan: { surfaces: [] } });
  });

  it("`__proto__` 코드도 Map으로 다룬다 — 프로토타입에서 값을 집지 않는다", () => {
    const plan = planProjectLocales(formats(changes([["__proto__", "ADD"]], [], [["__proto__", 2]])), entries(["i18n/en.json"]));
    // `__proto__`는 로케일 모양이 아니라 경로를 만들지 못한다 — 계획 전체가 거부된다.
    expect(plan).toMatchObject({ ok: false, error: "unsafe-path" });
  });
});

describe("observedLocalesOf — base 트리에서 관측한 이 소스의 로케일 (만료 입력)", () => {
  it("템플릿에 맞는 정규 파일의 로케일만", () => {
    const [item] = projectFormats([{ ...PROJECT, id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS }]);
    expect(observedLocalesOf(item!, [
      { path: "i18n/en.json", sha: "x", mode: "100644" }, { path: "i18n/ko.json", sha: "x", mode: "100755" },
      { path: "i18n/link.json", sha: "x", mode: "120000" }, { path: "i18n/nested/fr.json", sha: "x", mode: "100644" }, { path: "other/de.json", sha: "x", mode: "100644" },
    ])).toEqual({ status: "observed", locales: ["en", "ko"] });
  });
  it("개별 파일 포맷이 아니면 관측할 수 없다", () => {
    const [item] = projectFormats([{ ...PROJECT, adapterName: "ts-dict", pathTemplate: "src/i18n/*.ts", id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS }]);
    expect(observedLocalesOf(item!, [{ path: "src/i18n/a.ts", sha: "x", mode: "100644" }])).toEqual({ status: "unreadable" });
  });
});

describe("localeWorkOf — 소스별 언어 작업의 합", () => {
  it("행이 없는 소스는 0", () => {
    expect(localeWorkOf(state().surfaces)).toBe(0);
    expect(localeWorkOf(state({ localeChanges: { ...changes([["ko", "REMOVE"]]), work: 1 } }).surfaces)).toBe(1);
  });
});

/**
 * **거둘 언어 효과** (#265) — 전달 목록에 있는데 이번 스냅샷이 싣지 않는 효과. 전달된 의도를 취소하면 그 파일은 base와 같아져 파일 diff가 0이지만,
 * 열린 PR에는 옛 삭제·새 파일이 남아 Publish가 그것을 거둔다. 미리보기가 이 목록을 실어 "보낼 것 없음"과 가른다.
 */
describe("withdrawnLocalesOf — 전달됐는데 이번 스냅샷이 싣지 않는 효과 (#265)", () => {
  const surface = (id: string, slug: string, localeChanges?: SurfaceLocaleChanges) => ({ id, slug, ...(localeChanges === undefined ? {} : { localeChanges }) });
  const planOf = (captured: Record<string, { localeCode: string; effect: "create" | "delete" }[]>): ProjectLocalePlan => ({
    surfaces: Object.entries(captured).map(([surfaceId, effects]) => ({ surfaceId, surfaceSlug: surfaceId, exclude: [], creates: [], deletes: [], withheld: [], empty: [], captured: effects })),
  });

  it("거둘 효과는 그 소스 템플릿의 경로를 싣는다 — 화면이 파일 행(`Taken back from #N`)으로 말한다(시안 P1 ④)", () => {
    expect(withdrawnLocalesOf(NO_LOCALE_PLAN, [
      { ...surface("s1", "app", changes([], [{ localeCode: "fr", effect: "create" }])), pathTemplate: "apps/web/locales/{locale}.json" },
      surface("s2", "web", changes([], [{ localeCode: "ko", effect: "delete" }])),
    ])).toEqual([
      { surfaceSlug: "app", localeCode: "fr", effect: "create", path: "apps/web/locales/fr.json" },
      { surfaceSlug: "web", localeCode: "ko", effect: "delete", path: null },
    ]);
  });

  it("전달된 제거·추가를 취소(행 없음) → 그 delete·create를 거둔다 — 소스·코드순", () => {
    expect(withdrawnLocalesOf(NO_LOCALE_PLAN, [
      surface("s2", "web", changes([], [{ localeCode: "ko", effect: "delete" }])),
      surface("s1", "app", changes([], [{ localeCode: "fr", effect: "create" }, { localeCode: "de", effect: "delete" }])),
    ])).toEqual([
      { surfaceSlug: "app", localeCode: "de", effect: "delete", path: null },
      { surfaceSlug: "app", localeCode: "fr", effect: "create", path: null },
      { surfaceSlug: "web", localeCode: "ko", effect: "delete", path: null },
    ]);
  });

  it("이번 스냅샷이 같은 효과를 다시 실으면 거둘 것이 없다 — 새로 싣는 효과도 거두기가 아니다", () => {
    expect(withdrawnLocalesOf(planOf({ s1: [{ localeCode: "ko", effect: "delete" }, { localeCode: "fr", effect: "create" }] }),
      [surface("s1", "app", changes([["ko", "REMOVE"], ["fr", "ADD"]], [{ localeCode: "ko", effect: "delete" }], [["fr", 1]]))])).toEqual([]);
  });

  it("값을 비운 전달된 추가(캡처 없음)는 그 create를 거둔다", () => {
    expect(withdrawnLocalesOf(planOf({ s1: [] }), [surface("s1", "app", changes([["fr", "ADD"]], [{ localeCode: "fr", effect: "create" }]))]))
      .toEqual([{ surfaceSlug: "app", localeCode: "fr", effect: "create", path: null }]);
  });

  it("확인 안 됨(null)·빈 전달 목록·언어 상태 없는 소스는 거둘 것이 없다", () => {
    expect(withdrawnLocalesOf(NO_LOCALE_PLAN, [surface("s1", "app", changes([["ko", "REMOVE"]], null)), surface("s2", "web", changes([], [])), surface("s3", "docs")])).toEqual([]);
  });
});

describe("renderProject — 삭제·생성 계획은 그 소스의 REMOVE·ADD 행에서만 온다 (review-A2 F2)", () => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO, "i18n/fr.json": FR };
  it("REMOVE 행이 없는 경로의 delete는 렌더 전에 던진다 — 쓰기 0", async () => {
    const made = fake(files);
    const formats = projectFormats(state({ localeCodes: ["en", "ko"], localeChanges: changes([["ko", "REMOVE"]]) }).surfaces);
    const forged = { surfaces: [{ surfaceId: "s1", surfaceSlug: "default", exclude: ["ko"], creates: [], deletes: [{ localeCode: "ko", path: "i18n/fr.json" }], withheld: [], empty: [], captured: [] }] };
    await expect(renderProject(PROJECT, formats, made.client, undefined, forged)).rejects.toThrow(/unreachable: locale plan outside REMOVE\/ADD rows/);
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });
  it("ADD 행이 없는 언어의 create도 던진다", async () => {
    const made = fake(files);
    const formats = projectFormats(state({ localeCodes: ["en", "ko"], localeChanges: changes([["ko", "REMOVE"]]) }).surfaces);
    const forged = { surfaces: [{ surfaceId: "s1", surfaceSlug: "default", exclude: [], creates: [{ localeCode: "de", path: "i18n/de.json" }], deletes: [], withheld: [], empty: [], captured: [] }] };
    await expect(renderProject(PROJECT, formats, made.client, undefined, forged)).rejects.toThrow(/unreachable: locale plan outside REMOVE\/ADD rows/);
  });
  it("계획대로면 delete가 실리고 REMOVE 언어는 렌더하지 않는다", async () => {
    const made = fake(files);
    const loaded = state({ localeCodes: ["en", "ko"], localeChanges: changes([["ko", "REMOVE"]]) });
    const formats = projectFormats(loaded.surfaces);
    const planned = planProjectLocales(formats, tree(files).map(entry => ({ ...entry, mode: "100644" })));
    if (!planned.ok) throw new Error("plan");
    const { changes: out, rendered } = await renderProject(PROJECT, formats, made.client, undefined, planned.plan);
    expect(out).toContainEqual({ kind: "delete", path: "i18n/ko.json" });
    expect(rendered[0]!.files.map(file => file.path)).toEqual(["i18n/en.json"]);
  });
});

describe("ADD 새 파일은 기준 언어 파일에서 표현만 빌린다 (design §4 \"추가의 새 파일 표현\")", () => {
  it("4칸 기준 파일 → 새 파일도 4칸, 기준 값·키 구조는 없다. 다음 Publish(자기 파일이 원본)와 바이트가 같다", async () => {
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    const loaded = state({ localeCodes: ["en", "ko", "fr"], unpublished: 0, localeChanges: changes([["fr", "ADD"]], [], [["fr", 1]]) });
    const made = fake(files);
    const result = await runPull(deps(loaded, made).deps);
    expect(result).toMatchObject({ status: "committed", files: expect.arrayContaining([{ path: "i18n/fr.json", kind: "new" }]) });
    const created = snapshotOf(made)?.changes.find(change => change.path === "i18n/fr.json");
    expect(created).toEqual({ kind: "upsert", path: "i18n/fr.json", content: FR, inBase: false });

    // 고정점 — 머지 뒤 자기 파일이 원본이면 diff 0이다(전달된 create는 정규 렌더).
    const merged = { ...files, "i18n/fr.json": FR };
    const next = fake(merged);
    const again = await runPull(deps(state({ localeCodes: ["en", "ko", "fr"], unpublished: 0,
      localeChanges: { ...changes([["fr", "ADD"]], [{ localeCode: "fr", effect: "create" }], [["fr", 1]]), work: 0 } }), next).deps);
    expect(again).toEqual({ status: "skipped", reason: "no-edits" });
  });

  it("Chrome 새 파일에 기준 파일의 description·placeholders를 복사하지 않는다 — 되살린 언어의 `placeholders: null`은 유지한다", async () => {
    const CHROME = { ...PROJECT, adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json" };
    const base = '{\n\t"hi": {\n\t\t"description": "Greeting",\n\t\t"message": "Hi $NAME$",\n\t\t"placeholders": {\n\t\t\t"name": { "content": "$1" }\n\t\t}\n\t}\n}\n';
    const files = { "_locales/en/messages.json": base };
    const keys: RenderKey[] = [{ id: "kh", key: "hi", sourceText: "Hi $NAME$", description: "Greeting", orphaned: false,
      cells: { en: { value: "Hi $NAME$", description: "Greeting", placeholders: { name: { content: "$1" } } }, ko: { value: "안녕 $NAME$", placeholders: null } } }];
    const loaded: PullState = { ...state(), project: { ...CHROME },
      surfaces: [{ ...CHROME, id: "s1", slug: "default", localeCodes: ["en", "ko"], keys, localeChanges: changes([["ko", "ADD"]], [], [["ko", 1]]) }] };
    const made = fake(files);
    await runPull(deps(loaded, made).deps);
    const created = snapshotOf(made)?.changes.find(change => change.path === "_locales/ko/messages.json");
    // 탭 들여쓰기·필드 순서(description 먼저)는 빌리고, 값은 그 언어의 셀뿐이다.
    expect(created?.content).toBe('{\n\t"hi": {\n\t\t"message": "안녕 $NAME$",\n\t\t"placeholders": null\n\t}\n}\n');
  });
});

describe("runPull — 언어 변경의 조기 종료 세 자리 (design §4 판정표)", () => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO };

  it("셀 편집 0 + REMOVE 작업 → 실행해 삭제만 싣고 확인한다 (review-A2 F3 둘째)", async () => {
    const made = fake(files);
    const { deps: d, saveLastPulledAt, invalidateDelivery } = deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made);
    const result = await runPull(d);
    expect(result).toMatchObject({ status: "committed", delivered: 0, changed: ["i18n/ko.json"], changedValues: 0, files: [{ path: "i18n/ko.json", kind: "removed" }] });
    expect(snapshotOf(made)?.changes).toEqual([{ kind: "delete", path: "i18n/ko.json" }]);
    expect(invalidateDelivery).toHaveBeenCalledWith("p1", ["s1"]);
    // 캡처한 효과 목록이 확인 tx로 간다 — 셀 전달은 0이다(삭제는 번역 전달이 아니다).
    const call = saveLastPulledAt.mock.calls[0]!;
    expect(call[3]).toEqual([]);
    expect(call[6]).toEqual(new Map([["s1", [{ localeCode: "ko", effect: "delete" }]]]));
  });

  it("REMOVE + 다른 언어 편집 → delete에는 inBase가 없고 changedValues는 upsert 값만 센다 (review-A2 F3 첫째)", async () => {
    const edited: RenderKey[] = [{ ...KEYS[0]!, cells: { ...KEYS[0]!.cells, en: { value: "A2" } } }, KEYS[1]!];
    const loaded = state({ unpublished: 1, localeChanges: changes([["ko", "REMOVE"]]),
      pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "en", restoreValue: "A" } }] });
    loaded.surfaces[0]!.keys = edited;
    const made = fake(files);
    const result = await runPull(deps(loaded, made).deps);
    expect(snapshotOf(made)?.changes).toEqual([
      { kind: "upsert", path: "i18n/en.json", content: '{\n    "a": "A2",\n    "b": "B"\n}\n', inBase: true },
      { kind: "delete", path: "i18n/ko.json" },
    ]);
    expect(result).toMatchObject({ status: "committed", delivered: 1, changedValues: 1, files: [{ path: "i18n/en.json", kind: "updated" }, { path: "i18n/ko.json", kind: "removed" }] });
  });

  it("Translation 행 0(`maxUpdatedAt=null`)이어도 언어 작업이 있으면 실행·확인하고 `lastPulledAt`은 건드리지 않는다", async () => {
    const made = fake(files);
    const { deps: d, saveLastPulledAt } = deps(state({ maxUpdatedAt: null, localeChanges: changes([["ko", "REMOVE"]]) }), made);
    await expect(runPull(d)).resolves.toMatchObject({ status: "committed" });
    expect(saveLastPulledAt.mock.calls[0]?.[1]).toBeNull();
  });

  it("미전달 편집이 있는데 `maxUpdatedAt=null`이면 여전히 불변식 위반이다", async () => {
    const made = fake(files);
    await expect(runPull(deps(state({ maxUpdatedAt: null, unpublished: 1, localeChanges: changes([["ko", "REMOVE"]]) }), made).deps)).rejects.toThrow(/unreachable/);
  });

  it("셀이 전부 보류여도 안전한 삭제는 전달한다 — 보류 셀은 확인에 싣지 않는다", async () => {
    const withFr = { ...files, "i18n/fr.json": FR };
    // fr는 미전달 ADD인데 경로가 이미 있다 → 보류. 그 언어 편집도 보류다. ko 삭제만 나간다.
    const loaded = state({ localeCodes: ["en", "ko", "fr"], unpublished: 1, localeChanges: changes([["fr", "ADD"], ["ko", "REMOVE"]], [], [["fr", 1]]),
      pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "fr", restoreValue: "" } }] });
    const made = fake(withFr);
    const { deps: d, saveLastPulledAt } = deps(loaded, made);
    const result = await runPull(d);
    expect(snapshotOf(made)?.changes).toEqual([{ kind: "delete", path: "i18n/ko.json" }]);
    expect(result).toMatchObject({ status: "committed", delivered: 0, withheld: { file: 1, key: 0 },
      locales: { withheld: [{ surfaceSlug: "default", localeCode: "fr", path: "i18n/fr.json", reason: "proposal-path-exists" }], empty: [] } });
    expect(saveLastPulledAt.mock.calls[0]?.[5]).toHaveLength(1);
    // 보류된 ADD는 캡처하지 않는다 — 전달 목록에 없으니 작업으로 남는다.
    expect(saveLastPulledAt.mock.calls[0]?.[6]).toEqual(new Map([["s1", [{ localeCode: "ko", effect: "delete" }]]]));
  });

  it("셀이 전부 보류이고 언어 작업이 0이면 기존대로 `withheld` 스킵 — 쓰기 0", async () => {
    const withFr = { ...files, "i18n/fr.json": FR };
    const loaded = state({ localeCodes: ["en", "ko", "fr"], unpublished: 1, localeChanges: { ...changes([["fr", "ADD"]], [], [["fr", 1]]), work: 0 },
      pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "fr", restoreValue: "" } }] });
    const made = fake(withFr);
    const result = await runPull(deps(loaded, made).deps);
    expect(result).toMatchObject({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });

  it("값 0개 ADD만 있으면 원격 쓰기 0 — 작업이 없어 1층에서 끝난다", async () => {
    const made = fake(files);
    const result = await runPull(deps(state({ localeCodes: ["en", "ko", "de"], localeChanges: { ...changes([["de", "ADD"]]), work: 0 } }), made).deps);
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
    expect(made.calls).toEqual([]);
  });

  it("빈 ADD는 다른 작업과 함께여도 파일을 내지 않고 결과가 그 사실을 싣는다", async () => {
    const made = fake(files);
    const result = await runPull(deps(state({ localeCodes: ["en", "ko", "de"], localeChanges: changes([["de", "ADD"], ["ko", "REMOVE"]]) }), made).deps);
    expect(snapshotOf(made)?.changes.map(change => change.path)).toEqual(["i18n/ko.json"]);
    expect(result).toMatchObject({ status: "committed", locales: { withheld: [], empty: [{ surfaceSlug: "default", localeCode: "de" }] } });
  });

  it("전달된 REMOVE는 다음 스냅샷에도 다시 싣는다 — 삭제 PR이 열린 채 다른 언어 편집 → 재Publish에도 delete 유지", async () => {
    const edited: RenderKey[] = [{ ...KEYS[0]!, cells: { ...KEYS[0]!.cells, en: { value: "A3" } } }, KEYS[1]!];
    const loaded = state({ unpublished: 1, localeChanges: { ...changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]), work: 0 },
      pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "en", restoreValue: "A" } }] });
    loaded.surfaces[0]!.keys = edited;
    const made = fake(files, { openPr: { url: "https://github.com/o/r/pull/7", number: 7, title: "chore(i18n): sync [skip ci]" } });
    const result = await runPull(deps(loaded, made).deps);
    expect(snapshotOf(made)?.changes.map(change => change.kind)).toEqual(["upsert", "delete"]);
    expect(result).toMatchObject({ status: "committed", pr: "updated" });
  });

  it("전달된 의도의 취소 → 렌더가 base와 같으면 no-changes 수렴: PR 닫기·브랜치 되돌림이 끝난 뒤에만 빈 목록을 확인한다", async () => {
    const order: string[] = [];
    const made = fake(files, { refSha: { "heads/dev": "basehead", "heads/malmoi-i18n/sync-fixture": "stale" }, openPr: { url: "https://github.com/o/r/pull/7", number: 7, title: "t" } });
    const loaded = state({ localeChanges: { rows: [], valueCounts: new Map(), delivered: [{ localeCode: "ko", effect: "delete" }], work: 1 } });
    const { deps: d, saveLastPulledAt } = deps(loaded, made, {
      saveLastPulledAt: vi.fn(async () => { order.push("confirm"); }),
      invalidateDelivery: vi.fn(async () => { order.push("invalidate"); }),
    });
    const result = await runPull(d);
    expect(result).toMatchObject({ status: "skipped", reason: "no-changes", closedPr: { number: 7 } });
    expect(made.calls.map(call => call.method)).toEqual(expect.arrayContaining(["closePr", "resetSyncBranch"]));
    expect(order).toEqual(["invalidate", "confirm"]);
    void saveLastPulledAt;
    expect((d.saveLastPulledAt as ReturnType<typeof vi.fn>).mock.calls[0]?.[6]).toEqual(new Map([["s1", []]]));
  });

  it("되돌림이 실패하면 확인을 쓰지 않는다 — 전달 목록은 옛 값 그대로다", async () => {
    const made = fake(files, { refSha: { "heads/dev": "basehead", "heads/malmoi-i18n/sync-fixture": "stale" }, failOn: "resetSyncBranch" });
    const loaded = state({ localeChanges: { rows: [], valueCounts: new Map(), delivered: [{ localeCode: "ko", effect: "delete" }], work: 1 } });
    const { deps: d, saveLastPulledAt } = deps(loaded, made);
    await expect(runPull(d)).rejects.toThrow();
    expect(saveLastPulledAt).not.toHaveBeenCalled();
  });

  it("PR 생성이 실패하면 확인을 쓰지 않는다 — 삭제를 커밋했어도 전달이 아니다", async () => {
    const made = fake(files, { failOn: "createPr" });
    const { deps: d, saveLastPulledAt } = deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made);
    await expect(runPull(d)).rejects.toThrow();
    expect(saveLastPulledAt).not.toHaveBeenCalled();
  });
});

describe("PR/MR 본문 — 삭제 파일이 있을 때만 앱 코드 정리 안내 (design §4 끝)", () => {
  it("삭제가 없으면 옛 본문과 바이트가 같다", () => {
    expect(pullRequestBody([{ path: "i18n/ko.json", kind: "updated" }, { path: "i18n/fr.json", kind: "new" }])).toBe(
      "Updated 2 files from the translation DB.\n\n- `i18n/ko.json`\n- `i18n/fr.json`\n\nThis branch is a snapshot, not a history: it is force-updated on every pull.",
    );
  });
  it("삭제가 있으면 그 파일을 표시하고 앱 코드의 언어 참조를 정리하라고 말한다", () => {
    const body = pullRequestBody([{ path: "i18n/en.json", kind: "updated" }, { path: "i18n/ko.json", kind: "removed" }]);
    expect(body).toContain("- `i18n/ko.json` (removed)");
    expect(body).toMatch(/removes 1 language file/);
    expect(body).toMatch(/app code/);
  });
  it("실행이 만든 PR 본문이 이 생성기를 지난다 — GitHub·GitLab이 같은 `createPr` 본문을 받는다", async () => {
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    await runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made).deps);
    const body = made.calls.find(call => call.method === "createPr")?.args[3];
    expect(body).toBe(pullRequestBody([{ path: "i18n/ko.json", kind: "removed" }]));
  });
});

describe("publishFingerprint — 언어 변경 행·전달 목록·대상 blob·삭제 경로에 묶인다 (design §2)", () => {
  const base = state({ localeChanges: changes([["ko", "REMOVE"]]) });
  const input = { targets: [["i18n/ko.json", "sha-ko"]] as [string, string | null][], deletes: ["i18n/ko.json"] };
  const fp = (s: PullState, i = input) => publishFingerprint(s, "head", i);
  it("같은 입력이면 같다", () => {
    expect(fp(base)).toBe(fp(state({ localeChanges: changes([["ko", "REMOVE"]]) })));
  });
  it("행·요청 시각·전달 목록·대상 blob·삭제 경로가 바뀌면 다르다", () => {
    const now = fp(base);
    expect(fp(state({ localeChanges: changes([["ko", "ADD"]]) }))).not.toBe(now);
    expect(fp(state({ localeChanges: { ...changes([["ko", "REMOVE"]]), rows: [{ localeCode: "ko", operation: "REMOVE", requestedAt: new Date(1) }] } }))).not.toBe(now);
    expect(fp(state({ localeChanges: changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]) }))).not.toBe(now);
    expect(fp(state({ localeChanges: changes([["ko", "REMOVE"]], null) }))).not.toBe(now);
    expect(fp(base, { ...input, targets: [["i18n/ko.json", "sha-ko-2"]] })).not.toBe(now);
    expect(fp(base, { ...input, deletes: [] })).not.toBe(now);
  });
  it("언어 변경이 없는 프로젝트의 지문은 옛 바이트 그대로다", () => {
    expect(publishFingerprint(state(), "head")).toBe(publishFingerprint(state(), "head", { targets: [], deletes: [] }));
  });
  it("미리보기 지문이 실행 입력(대상 blob)과 다르면 reconfirm — 쓰기 0", async () => {
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    const loaded = state({ localeChanges: changes([["ko", "REMOVE"]]) });
    const stale = publishFingerprint(loaded, "basehead", { targets: [["i18n/ko.json", "old"]], deletes: ["i18n/ko.json"] });
    const made = fake(files);
    expect(await runPull(deps(loaded, made).deps, stale)).toEqual({ status: "skipped", reason: "reconfirm" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    const fresh = publishFingerprint(loaded, "basehead", { targets: [["i18n/ko.json", blobSha(KO)]], deletes: ["i18n/ko.json"] });
    const again = fake(files);
    await expect(runPull(deps(loaded, again).deps, fresh)).resolves.toMatchObject({ status: "committed" });
  });
});

describe("수동·MCP Publish의 스냅샷 전 만료 (design §1 \"자동 적재가 만료를 겸한다\")", () => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
  it("행이 있으면 열린 PR 조회·관측을 넘기고, 만료가 있었으면 스냅샷을 다시 읽는다", async () => {
    const made = fake(files);
    const before = state({ unpublished: 1, localeChanges: { ...changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]), work: 0 },
      pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "en", restoreValue: "A" } }] });
    const after = state({ unpublished: 1, pendingEdits: before.pendingEdits });
    after.surfaces[0]!.keys = [{ ...KEYS[0]!, cells: { ...KEYS[0]!.cells, en: { value: "A4" } } }, KEYS[1]!];
    const loads = [before, after];
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => [{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE" as const, presence: "active" as const }]);
    const { deps: d } = deps(before, made, { loadState: async () => loads.shift()!, expireLocales });
    const result = await runPull(d);
    expect(expireLocales).toHaveBeenCalledWith({ projectId: "p1", pullRequest: "none-open",
      surfaces: [{ surfaceId: "s1", surfaceSlug: "default", observed: { status: "observed", locales: ["en", "ko"] } }] });
    // 닫힌 요청을 다시 싣지 않는다 — 만료 뒤 스냅샷엔 REMOVE가 없다.
    expect(snapshotOf(made)?.changes.map(change => change.kind)).toEqual(["upsert"]);
    expect(result).toMatchObject({ status: "committed" });
  });
  it("열린 PR이 있으면 `open`을 넘긴다", async () => {
    const made = fake(files, { openPr: { url: "u", number: 3, title: "t" } });
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    await runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made, { expireLocales }).deps);
    expect(expireLocales.mock.calls[0]?.[0].pullRequest).toBe("open");
  });
  it("PR 조회가 실패하면 Publish가 실패한다 — 종료된 요청을 다시 싣지 않는다(fail-closed)", async () => {
    const made = fake(files, { failOn: "findOpenPr" });
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    await expect(runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made, { expireLocales }).deps)).rejects.toThrow();
    expect(expireLocales).not.toHaveBeenCalled();
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });
  it("행이 없는 프로젝트는 조회하지 않는다 — 기존 호출 순서 그대로", async () => {
    const made = fake(files);
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    await runPull(deps(state({ unpublished: 1 }), made, { expireLocales }).deps);
    expect(expireLocales).not.toHaveBeenCalled();
    expect(made.calls.some(call => call.method === "findOpenPr" && made.calls.indexOf(call) < made.calls.findIndex(c => c.method === "getBlobText"))).toBe(false);
  });
});

/**
 * **작업 0이어도 전달된 효과가 있으면 1층 앞에서 만료를 돈다** (#267). 전달된 제거의 PR이 머지 없이 닫힌 창은 현재 = 전달이라 작업이 0이다 — 1층이
 * 먼저 끝나면 만료가 돌지 않고 결과가 "리포에 이미 있다"는 거짓을 말한다. 전달된 효과가 없는 행(값 0개 ADD)은 그대로 1층에서 끝난다(원격 0회).
 */
describe("작업 0 + 전달된 효과 — 1층 전 만료 (#267)", () => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
  const deliveredRemove = { ...changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]), work: 0 };
  const EXPIRED = [{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE" as const, presence: "active" as const }];

  it("만료가 있었으면 다시 읽고, 보낼 것이 없으면 no-edits + 버린 요청 — 쓰기 0", async () => {
    const made = fake(files);
    const loads = [state({ localeChanges: deliveredRemove }), state()];
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => EXPIRED);
    const result = await runPull(deps(loads[0]!, made, { loadState: async () => loads.shift()!, expireLocales }).deps, "fingerprint-from-preview");
    expect(expireLocales).toHaveBeenCalledWith({ projectId: "p1", pullRequest: "none-open",
      surfaces: [{ surfaceId: "s1", surfaceSlug: "default", observed: { status: "observed", locales: ["en", "ko"] } }] });
    expect(result).toEqual({ status: "skipped", reason: "no-edits", expired: EXPIRED });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });

  it("열린 PR이면 만료 0 — no-edits에 버린 요청이 없다, 쓰기 0", async () => {
    const made = fake(files, { openPr: { url: "u", number: 3, title: "t" } });
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    const result = await runPull(deps(state({ localeChanges: deliveredRemove }), made, { expireLocales }).deps);
    expect(expireLocales.mock.calls[0]?.[0].pullRequest).toBe("open");
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });

  it("PR 조회가 실패하면 실패한다(fail-closed) — 만료하지 않는다", async () => {
    const made = fake(files, { failOn: "findOpenPr" });
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    await expect(runPull(deps(state({ localeChanges: deliveredRemove }), made, { expireLocales }).deps)).rejects.toThrow();
    expect(expireLocales).not.toHaveBeenCalled();
  });

  it("전달된 효과가 없는 행(값 0개 ADD)은 1층에서 끝난다 — 원격 0회", async () => {
    const made = fake(files);
    const expireLocales = vi.fn<NonNullable<PullDeps["expireLocales"]>>(async () => []);
    const result = await runPull(deps(state({ localeCodes: ["en", "ko", "de"], localeChanges: { ...changes([["de", "ADD"]]), work: 0 } }), made, { expireLocales }).deps);
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
    expect(made.calls).toEqual([]);
    expect(expireLocales).not.toHaveBeenCalled();
  });
});

describe("만료 판정의 읽기 전용 쪽 — 미리보기가 실행과 같은 판정을 쓴다 (#267)", () => {
  const surface = (localeChanges: SurfaceLocaleChanges | undefined, localeCodes = ["en"]) =>
    ({ ...PROJECT, id: "s1", slug: "default", localeCodes, keys: KEYS, ...(localeChanges === undefined ? {} : { localeChanges }) });
  const deliveredRemove = { ...changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]), work: 0 };
  const base = tree({ "i18n/en.json": EN, "i18n/ko.json": KO }).map(entry => ({ ...entry, mode: "100644" }));

  it("expiryCheckApplies — 행이 없으면 아니다 · 작업이 있으면 그렇다 · 작업 0이면 전달된 효과가 있는 행 소스가 있을 때만", () => {
    expect(expiryCheckApplies(1, [surface(undefined)])).toBe(false);
    expect(expiryCheckApplies(1, [surface({ ...changes([["de", "ADD"]]), work: 0 })])).toBe(true);
    expect(expiryCheckApplies(0, [surface(changes([["ko", "REMOVE"]]))])).toBe(true);
    expect(expiryCheckApplies(0, [surface(deliveredRemove)])).toBe(true);
    expect(expiryCheckApplies(0, [surface({ ...changes([["de", "ADD"]]), work: 0 })])).toBe(false);
    // 확인 안 된 목록(`null`)은 만료할 수 없다 — 작업 0이면 1층 그대로다.
    expect(expiryCheckApplies(0, [surface({ ...changes([["ko", "REMOVE"]], null), work: 0 })])).toBe(false);
  });

  it("expiringLocalesOf — 열린 PR 없음(성공한 조회) + 현재 = 전달 + 관측이면 만료로 판정한다. 열림·조회 실패·관측 불가는 0", () => {
    const formats = projectFormats([surface(deliveredRemove)]);
    expect(expiringLocalesOf(formats, "none-open", base)).toEqual([{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE", presence: "active" }]);
    // 머지됐으면(파일이 base에 없다) orphan이다 — 실행의 `expireLocaleChanges`와 같은 존재 판정이다(fix1 R1).
    expect(expiringLocalesOf(formats, "none-open", base.filter(entry => entry.path !== "i18n/ko.json"))).toEqual([{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE", presence: "orphan" }]);
    expect(expiringLocalesOf(formats, "open", base)).toEqual([]);
    expect(expiringLocalesOf(formats, "failed", base)).toEqual([]);
    // 모순 행(orphan ADD — 구버전 잔재)은 판정이 PR 상태와 무관하게 만료로 보지만, 조회가 실패하면 실행이 먼저 실패한다 — 미리보기도 버린다고 말하지 않는다(fix1 W4).
    expect(expiringLocalesOf(projectFormats([surface({ ...changes([["fr", "ADD"]]), work: 0 })]), "failed", base)).toEqual([]);
    expect(expiringLocalesOf(projectFormats([surface({ ...changes([["fr", "ADD"]]), work: 0 })]), "open", base)).toEqual([{ surfaceSlug: "default", localeCode: "fr", operation: "ADD", presence: "orphan" }]);
    // 아직 보내지 않은 제거(현재 ≠ 전달)는 만료하지 않는다.
    expect(expiringLocalesOf(projectFormats([surface(changes([["ko", "REMOVE"]]))]), "none-open", base)).toEqual([]);
  });

  it("afterExpiry — 만료할 코드의 행과 전달 효과를 빼고, 활성 목록을 만료 뒤 존재로 맞추고, 작업 수를 다시 센다", () => {
    const mixed = { ...changes([["ko", "REMOVE"], ["fr", "ADD"]], [{ localeCode: "fr", effect: "create" }, { localeCode: "ko", effect: "delete" }], [["fr", 1]]), work: 0 };
    // 미머지 종료된 제거 — ko가 다시 활성이다.
    const [revived] = afterExpiry([surface(mixed, ["en", "fr"])], [{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE", presence: "active" }]);
    expect(revived?.localeChanges?.rows.map(row => row.localeCode)).toEqual(["fr"]);
    expect(revived?.localeChanges?.delivered).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(revived?.localeCodes).toEqual(["en", "fr", "ko"]);
    expect(revived?.localeChanges?.work).toBe(0);
    // 미머지 종료된 추가 — fr이 비활성이 된다.
    const [dropped] = afterExpiry([surface(mixed, ["en", "fr"])], [{ surfaceSlug: "default", localeCode: "fr", operation: "ADD", presence: "orphan" }]);
    expect(dropped?.localeCodes).toEqual(["en"]);
    expect(dropped?.localeChanges?.delivered).toEqual([{ localeCode: "ko", effect: "delete" }]);
    const untouched = [surface(mixed)];
    expect(afterExpiry(untouched, [])).toBe(untouched);
  });

  it("reachedRepository — 리포가 요청대로인가(제거는 orphan, 추가는 active)", () => {
    expect(reachedRepository({ operation: "REMOVE", presence: "orphan" })).toBe(true);
    expect(reachedRepository({ operation: "REMOVE", presence: "active" })).toBe(false);
    expect(reachedRepository({ operation: "ADD", presence: "active" })).toBe(true);
    expect(reachedRepository({ operation: "ADD", presence: "orphan" })).toBe(false);
  });
});

describe("조기 종료 ②는 전달 가능한 언어 작업으로 판정한다 (R-B2 🟡 Y1)", () => {
  const withFr = { "i18n/en.json": EN, "i18n/ko.json": KO, "i18n/fr.json": FR };
  const heldAdd = (unpublished: number) => state({ localeCodes: ["en", "ko", "fr"], unpublished, localeChanges: changes([["fr", "ADD"]], [], [["fr", 1]]),
    pendingEdits: unpublished === 0 ? [] : [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "fr", restoreValue: "" } }] });

  it("보류된 ADD만 + 셀 보류 → 쓰기 0, `withheld` 스킵(그 ADD를 싣지 못하므로 언어 작업이 아니다)", async () => {
    const made = fake(withFr, { refSha: { "heads/dev": "basehead", "heads/malmoi-i18n/sync-fixture": "stale" }, openPr: { url: "u", number: 7, title: "t" } });
    const result = await runPull(deps(heldAdd(1), made).deps);
    expect(result).toMatchObject({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 },
      locales: { withheld: [{ localeCode: "fr", reason: "proposal-path-exists" }] } });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });

  it("보류된 ADD만 + 셀 0 → 쓰기 0, 열린 PR·sync 브랜치를 건드리지 않는다", async () => {
    const made = fake(withFr, { refSha: { "heads/dev": "basehead", "heads/malmoi-i18n/sync-fixture": "stale" }, openPr: { url: "u", number: 7, title: "t" } });
    const { deps: d, saveLastPulledAt } = deps(heldAdd(0), made);
    const result = await runPull(d);
    expect(result).toMatchObject({ status: "skipped", reason: "no-edits", locales: { withheld: [{ localeCode: "fr" }] } });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(saveLastPulledAt).not.toHaveBeenCalled();
  });

  it("확인 안 된 전달 목록(`null`)은 다른 것으로 센다 — 같은 효과라도 다시 확인한다", async () => {
    const made = fake({ "i18n/en.json": EN });
    const loaded = state({ localeChanges: { ...changes([["ko", "REMOVE"]], null), work: 1 } });
    await expect(runPull(deps(loaded, made).deps)).resolves.toMatchObject({ status: "skipped", reason: "no-changes" });
  });
});

describe("열린 PR 본문 갱신 — 정리 안내 (R-B2 🟡 Y3)", () => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
  it("열린 PR + 새 삭제 → 본문을 다시 쓴다", async () => {
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body: "Updated 1 file from the translation DB.\n\n- `i18n/en.json`" } });
    await runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made).deps);
    expect(made.calls.find(call => call.method === "updatePr")?.args).toEqual([7, pullRequestBody([{ path: "i18n/ko.json", kind: "removed" }])]);
  });
  it("본문이 이미 같으면 쓰지 않는다", async () => {
    const body = pullRequestBody([{ path: "i18n/ko.json", kind: "removed" }]);
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body } });
    await runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made).deps);
    expect(made.calls.some(call => call.method === "updatePr")).toBe(false);
  });

  /**
   * **사람이 고친 본문을 덮지 않는다** (B2 fix2). 본문을 다시 쓰는 것은 정리 안내를 더하거나 빼야 할 때 — 본문이 말하는 삭제 파일 집합이 이 스냅샷의
   * 삭제 집합과 다를 때 — 뿐이다.
   */
  const HUMAN = "Reviewer notes: please double-check the French wording before merging.";
  const editingEn = () => {
    const loaded = state({ unpublished: 1, pendingEdits: [{ id: "t1", token: "tok", cell: { surfaceId: "s1", keyId: "ka", localeCode: "en", restoreValue: "A" } }] });
    loaded.surfaces[0]!.keys = [{ ...KEYS[0]!, cells: { ...KEYS[0]!.cells, en: { value: "A2" } } }, KEYS[1]!];
    return loaded;
  };
  it("사람이 고친 본문 + 삭제 변화 없음 → 본문을 건드리지 않는다", async () => {
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body: HUMAN } });
    await expect(runPull(deps(editingEn(), made).deps)).resolves.toMatchObject({ status: "committed", pr: "updated" });
    expect(made.calls.some(call => call.method === "updatePr")).toBe(false);
  });
  it("사람이 고친 본문이 같은 삭제를 이미 말하면 건드리지 않는다 — 다른 파일이 늘어도", async () => {
    const body = `${pullRequestBody([{ path: "i18n/ko.json", kind: "removed" }])}\n\n${HUMAN}`;
    const loaded = editingEn();
    loaded.surfaces[0]!.localeChanges = changes([["ko", "REMOVE"]], [{ localeCode: "ko", effect: "delete" }]);
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body } });
    await runPull(deps(loaded, made).deps);
    expect(made.calls.some(call => call.method === "updatePr")).toBe(false);
  });
  it("사람이 고친 본문 + 새 삭제 → 정리 안내가 실린 본문으로 다시 쓴다", async () => {
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body: HUMAN } });
    await runPull(deps(state({ localeChanges: changes([["ko", "REMOVE"]]) }), made).deps);
    const body = made.calls.find(call => call.method === "updatePr")?.args[1];
    expect(body).toContain("- `i18n/ko.json` (removed)");
    expect(body).toMatch(/app code/);
  });
  it("삭제를 취소하면 정리 안내를 뺀 본문으로 다시 쓴다", async () => {
    const made = fake(files, { openPr: { url: "u", number: 7, title: "chore [skip-malmoi-i18n]", body: pullRequestBody([{ path: "i18n/en.json", kind: "updated" }, { path: "i18n/ko.json", kind: "removed" }]) } });
    await runPull(deps(editingEn(), made).deps);
    const body = made.calls.find(call => call.method === "updatePr")?.args[1];
    expect(body).toBe(pullRequestBody([{ path: "i18n/en.json", kind: "updated" }]));
  });
});

describe("removedFilesStated — 본문이 말하는 삭제 파일", () => {
  it("생성기가 쓴 `(removed)` 줄만 읽는다 — 사람 문장·다른 줄은 보지 않는다", () => {
    const body = `${pullRequestBody([{ path: "i18n/en.json", kind: "updated" }, { path: "i18n/ko.json", kind: "removed" }, { path: "a b/fr.json", kind: "removed" }])}\n\nWe removed nothing else (removed)`;
    expect(removedFilesStated(body)).toEqual(["a b/fr.json", "i18n/ko.json"]);
    expect(removedFilesStated("")).toEqual([]);
  });
});

describe("결정적 언어 계획 거부 (R-B2 🟡 Y2)", () => {
  it("경로 충돌은 `LocalePlanRefused`(코드 locale-plan-refused) — 재시도 불가로 분류된다", async () => {
    const surfaces = [
      { ...PROJECT, id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS, localeChanges: changes([["ko", "REMOVE"]]) },
      { ...PROJECT, id: "s2", slug: "other", localeCodes: ["ko"], baseLocale: "ko", keys: [] },
    ];
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    const error = await runPull(deps({ ...state(), surfaces }, made).deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocalePlanRefused);
    expect(error).toMatchObject({ code: "locale-plan-refused", path: "i18n/ko.json", branch: "dev", refusal: "path-conflict" });
    // 화면이 고칠 자리를 말한다(시안 P1 ⑥) — 어느 소스의 어느 언어가 어느 소스의 경로에 닿았나. 소유 판정은 계획이 쓴 경로 목록 그대로다.
    expect(error).toMatchObject({ surfaceSlug: "default", localeCode: "ko", ownerSlug: "other" });
    expect(classifySyncError(error)).toMatchObject({ code: "locale-plan-refused", retryable: false });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });
});
