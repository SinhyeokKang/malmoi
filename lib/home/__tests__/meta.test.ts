import { describe, expect, it } from "vitest";

import { homePublishRun, homeSyncRun, type ImportRunEvent, type PublishRunEvent } from "../meta";

const at = (iso: string): Date => new Date(iso);

/**
 * 사건 → 메타 열의 실행 하나 (project-card-tabs §2.2). 주체는 `triggerOf`, 시각은 **사건의 종료 시각**(`finishedAt`)이다 —
 * 전 소스 `lastImportedAt`의 최댓값이 아니다. ⚠️ **보류는 사건에서 오지 않는다** (ux-drift-unify Q6) — 지금의 판정이다.
 */
describe("homeSyncRun — 시각을 전진시킨 IMPORT 사건 → Sync 탭 실행", () => {
  const started = at("2026-10-03T18:00:00Z");
  const finished = at("2026-10-03T18:05:00Z");
  const event = (over: Partial<ImportRunEvent> = {}): ImportRunEvent => ({
    actorKind: "USER", kind: "IMPORT", subtype: "import.run", result: "imported", occurredAt: started, finishedAt: finished,
    payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["mobile", "web"], keys: 903, changedValues: 128 }, ...over,
  });

  it("사건 하나에서 주체·종료 시각·결과·수·소스를 읽는다", () => {
    expect(homeSyncRun(event())).toEqual({
      trigger: "manual", at: finished, result: "imported", changedValues: 128, keys: 903, surfaceSlugs: ["mobile", "web"],
    });
  });

  /** 사건 `occurredAt`은 시작이다 — `Synced`는 종료다. 종료가 비었으면(옛 행) 시작으로 물러난다. */
  it("Synced는 종료 시각이다 — 비었으면 시작 시각", () => {
    expect(homeSyncRun(event())?.at).toEqual(finished);
    expect(homeSyncRun(event({ finishedAt: null }))?.at).toEqual(started);
  });

  it.each([
    ["수동 Sync", event(), "manual"],
    ["첫 적재", event({ subtype: "import.first" }), "manual"],
    ["야간 적재", event({ actorKind: "AUTOMATION", subtype: "import.nightly" }), "nightly"],
    ["CI 적재", event({ actorKind: "AUTOMATION", subtype: "import.ci" }), "ci"],
  ] as const)("%s → %s", (_, input, trigger) => {
    expect(homeSyncRun(input)?.trigger).toBe(trigger);
  });

  it("사건이 없으면 실행이 없다 — 이력 도입 전", () => {
    expect(homeSyncRun(null)).toBeNull();
  });

  /** ⚠️ 관측하지 않은 칸은 `null`이다 — 옛 행의 payload에 `changedValues`·`keys`가 없다. */
  it("옛 payload의 빈 칸은 null · 소스는 빈 배열", () => {
    expect(homeSyncRun(event({ payload: { source: "nightly" } }))).toMatchObject({ changedValues: null, keys: null, surfaceSlugs: [] });
  });

  /** ⚠️ 성공 술어는 `lastImportedAt`을 전진시키는 집합(imported·partial)과 같다. 조회가 SQL로 같은 술어를 걸고 여기서 한 번 더 거른다. */
  it.each(["deferred", "superseded", "failed", "upToDate", "running", null] as const)("성공이 아닌 적재(%s)는 실행이 아니다", (result) => {
    expect(homeSyncRun(event({ result }))).toBeNull();
  });

  /** `partial` 사건은 표면이 전부 코드를 달고 끝났을 수 있다 — 그 표면은 `lastImportedAt`을 안 쓴다(`importOutcomeFields`). */
  it("partial인데 imported 표면이 없으면 실행이 아니다", () => {
    const input = event({ result: "partial", payload: { kind: "IMPORT", source: "nightly",
      surfaces: [{ surfaceSlug: "web", status: "partial", count: 3, reason: "partial-import" }] } });
    expect(homeSyncRun(input)).toBeNull();
  });

  it("partial이어도 imported 표면이 하나 있으면 결과 partial로 선다", () => {
    const input = event({ actorKind: "AUTOMATION", subtype: "import.nightly", result: "partial", payload: { kind: "IMPORT", source: "nightly", surfaces: [
      { surfaceSlug: "app", status: "imported", count: 3, reason: null },
      { surfaceSlug: "web", status: "failed", count: null, reason: "parse-failed" },
    ] } });
    expect(homeSyncRun(input)).toMatchObject({ trigger: "nightly", result: "partial" });
  });
});

describe("homePublishRun — 마지막 성공 PUBLISH 사건 + SyncRun → Publish 탭 실행", () => {
  const event = (over: Partial<PublishRunEvent> = {}): PublishRunEvent => ({
    actorKind: "AUTOMATION", kind: "PUBLISH", subtype: "publish.run", result: null,
    occurredAt: at("2026-10-02T09:00:00Z"), finishedAt: null,
    payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null },
    syncRun: { finishedAt: at("2026-10-02T09:01:00Z"), prUrl: "https://github.com/acme/web/pull/127", changedValues: 24 },
    ...over,
  });

  /** 한 실행의 사실만 — `Project.lastPublishedAt`·`lastPrUrl`이 아니라 고른 사건과 조인한 `SyncRun`에서 읽는다. */
  it("시각·PR·값 수는 그 SyncRun의 것이다", () => {
    expect(homePublishRun(event())).toEqual({
      trigger: "nightly", at: at("2026-10-02T09:01:00Z"), prUrl: "https://github.com/acme/web/pull/127", changedValues: 24, surfaceSlugs: ["web"],
    });
  });

  it("사람이 보냈으면 manual", () => {
    expect(homePublishRun(event({ actorKind: "USER" }))?.trigger).toBe("manual");
  });

  /** 백필된 옛 사건은 `SyncRun`이 없을 수 있다 — 그 사건 자체의 시각으로 선다. 기록 이전 실행의 `changedValues`는 `null`이다. */
  it("SyncRun이 없으면 사건 시각 · PR·수 없음", () => {
    expect(homePublishRun(event({ result: "sent", syncRun: null }))).toEqual({
      trigger: "nightly", at: at("2026-10-02T09:00:00Z"), prUrl: null, changedValues: null, surfaceSlugs: ["web"],
    });
  });

  it("사건이 없으면 실행이 없다 — 발송 전", () => {
    expect(homePublishRun(null)).toBeNull();
  });
});
