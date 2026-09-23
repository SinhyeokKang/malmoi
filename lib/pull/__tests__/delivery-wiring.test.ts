import { describe, expect, it } from "vitest";
import { blobSha } from "@/lib/githash";
import { runPull, type DeliveryContext, type PullDeps, type PullState } from "../run";
import { createFakeGitClient, type FakeCall } from "./fake-client";
import type { GitClient } from "../client";

/**
 * **Publish와 전달 기준의 배선** (translation-rework T6 — ARCHITECTURE §0 불변식 9 · §5.8).
 *
 * 첫 외부 쓰기 **전에** 전달 확인을 무효화하고, 무효화가 실패하면 GitHub에 아무것도 쓰지 않는다. 성공 확정은 기존
 * `saveLastPulledAt`이 같은 스냅샷의 context를 받아 한 트랜잭션에서 한다(SQL은 `delivery-confirm.integration.ts`가 잰다).
 * ⚠️ 무효화가 필요 없는 종료(no-edits · writer-warnings · 쓰기 없는 no-changes)에서는 부르지 않는다 — 부르면 편집 없는 cron이
 * DB 쓰기를 만들고, 쓰기 없는 동등 확인이 기준을 이유 없이 잃는다.
 */
const PROJECT = {
  id: "p1", slug: "demo", repoOwner: "o", repoName: "r", baseBranch: "dev", installationId: "123",
  adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en",
  lastPulledAt: null as Date | null,
};
const KO = '{\n  "a.one": "하나"\n}\n';
const EN = '{\n  "a.one": "one"\n}\n';
const CONTEXTS: DeliveryContext[] = [{ surfaceId: "s1", fingerprint: "ctx-1" }];

function state(over: Partial<PullState> = {}): PullState {
  return {
    project: { ...PROJECT },
    surfaces: [{ ...PROJECT, id: "s1", slug: "default", localeCodes: ["en", "ko"],
      keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나" }, en: { value: "one" } } }] }],
    maxUpdatedAt: new Date("2026-09-01T10:00:00Z"), unpublished: 1, pendingEdits: [], deliveryContexts: CONTEXTS,
    ...over,
  };
}

function harness(given: { client: GitClient; calls: FakeCall[] }, over: Partial<PullDeps> = {}) {
  const order: string[] = [];
  const saved: unknown[][] = [];
  const deps: PullDeps = {
    loadState: async () => state(),
    createClient: async () => given.client,
    invalidateDelivery: async () => { order.push("invalidate"); },
    saveLastPulledAt: async (...args) => { order.push("save"); saved.push(args); },
    syncBranch: "malmoi-i18n/sync",
    ...over,
  };
  return { deps, order, saved };
}

const committing = () => createFakeGitClient({ refSha: { "heads/dev": "basehead" }, tree: { basehead: [] } });
const sameAsBase = (sync?: string) => createFakeGitClient({
  refSha: { "heads/dev": "basehead", ...(sync === undefined ? {} : { "heads/malmoi-i18n/sync": sync }) },
  tree: { basehead: [{ path: "i18n/ko.json", sha: blobSha(KO) }, { path: "i18n/en.json", sha: blobSha(EN) }] },
  blobs: { [blobSha(KO)]: KO, [blobSha(EN)]: EN },
});

const MUTATIONS = ["createTree", "createCommit", "createRef", "updateRefForce", "createPr", "updatePrTitle", "updatePrBase"];

describe("runPull — 첫 외부 쓰기 전에 전달 확인을 무효화한다", () => {
  it("커밋 경로: 무효화가 createTree보다 먼저 한 번 일어난다", async () => {
    const fake = committing();
    const log: string[] = [];
    const deps: PullDeps = {
      loadState: async () => state(),
      createClient: async () => fake.client,
      invalidateDelivery: async () => { log.push(`invalidate@${fake.calls.length}`); },
      saveLastPulledAt: async () => {},
      syncBranch: "malmoi-i18n/sync",
    };
    const result = await runPull(deps);
    expect(result.status).toBe("committed");
    const firstWrite = fake.calls.findIndex(c => MUTATIONS.includes(c.method));
    expect(log).toEqual([`invalidate@${firstWrite}`]);
  });

  it("무효화가 실패하면 GitHub 쓰기 0회이고 성공 확정도 없다", async () => {
    const fake = committing();
    const { deps, saved } = harness(fake, { invalidateDelivery: async () => { throw new Error("db down"); } });
    await expect(runPull(deps)).rejects.toThrow(/db down/);
    expect(fake.calls.map(c => c.method).filter(m => MUTATIONS.includes(m))).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("no-changes인데 sync 브랜치를 base로 되돌리면 그 force 전에 무효화한다", async () => {
    const fake = sameAsBase("stale");
    const log: string[] = [];
    const deps: PullDeps = {
      loadState: async () => state(),
      createClient: async () => fake.client,
      invalidateDelivery: async () => { log.push(`invalidate@${fake.calls.length}`); },
      saveLastPulledAt: async () => {},
      syncBranch: "malmoi-i18n/sync",
    };
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-changes" });
    const force = fake.calls.findIndex(c => c.method === "updateRefForce");
    expect(force).toBeGreaterThanOrEqual(0);
    expect(log).toEqual([`invalidate@${force}`]);
  });

  it("쓰기 없는 no-changes는 무효화하지 않는다 — 동등 확인이 기준을 이유 없이 잃지 않는다", async () => {
    const fake = sameAsBase("basehead");
    const { deps, order } = harness(fake);
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-changes" });
    expect(order).toEqual(["save"]);
  });

  it("no-edits는 무효화도 확정도 없다 — 편집 없는 cron은 DB에 쓰지 않는다", async () => {
    const fake = createFakeGitClient({});
    const { deps, order } = harness(fake, { loadState: async () => state({ unpublished: 0 }) });
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-edits" });
    expect(order).toEqual([]);
  });

  it("writer-warnings는 무효화하지 않는다 — GitHub에 쓰기 전에 멈춘 실행이다", async () => {
    const fake = committing();
    const conflicting = state({ surfaces: [{ ...PROJECT, nested: true, id: "s1", slug: "default", localeCodes: ["en"], keys: [
      { key: "a.b", sourceText: "leaf", orphaned: false, cells: { en: { value: "leaf" } } },
      { key: "a.b.c", sourceText: "deeper", orphaned: false, cells: { en: { value: "deeper" } } },
    ] }] });
    const { deps, order } = harness(fake, { loadState: async () => conflicting });
    expect(await runPull(deps)).toMatchObject({ status: "skipped", reason: "writer-warnings" });
    expect(order).toEqual([]);
  });
});

describe("runPull — 성공 확정에 같은 스냅샷의 context를 넘긴다", () => {
  it("committed는 캡처한 context를 saveLastPulledAt에 싣는다", async () => {
    const { deps, saved } = harness(committing());
    await runPull(deps);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[4]).toEqual(CONTEXTS);
  });

  it("no-changes도 같은 context를 싣는다 — 동등 확인도 전달 확인이다", async () => {
    const { deps, saved } = harness(sameAsBase("basehead"));
    await runPull(deps);
    expect(saved[0]?.[4]).toEqual(CONTEXTS);
  });

  it("스냅샷에 context가 없으면 빈 목록을 싣는다 — 확인할 소스가 없다", async () => {
    const { deps, saved } = harness(committing(), { loadState: async () => state({ deliveryContexts: undefined }) });
    await runPull(deps);
    expect(saved[0]?.[4]).toEqual([]);
  });
});
