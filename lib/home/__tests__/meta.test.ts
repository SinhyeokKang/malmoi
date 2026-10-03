import { describe, expect, it } from "vitest";

import { homePublishRun, homeSyncRun, metaRows, type ImportRunEvent, type MetaRow, type PublishRunEvent } from "../meta";

/**
 * 오른쪽 `Project` 메타 열 (캔버스 `2a` 오른쪽 · DESIGN §6.64). **행이 상태에 따라 사라지거나 는다** —
 * 그 규칙을 JSX의 `&&`에 흩으면 여섯 상태 × 열 행의 매트릭스를 화면을 읽어야만 알 수 있다.
 */

const at = (iso: string): Date => new Date(iso);

const base = {
  state: "default" as const,
  repoOwner: "acme",
  repoName: "web",
  baseBranch: "main",
  surfaces: 3,
  locales: ["en", "ja", "ko"],
  keys: 903,
  members: 4,
  lastSyncAt: at("2026-09-14T00:00:00Z"),
  lastImportFailedAt: null,
  lastImportError: null,
  lastPublishedAt: at("2026-09-13T00:00:00Z"),
  lastPrUrl: "https://github.com/acme/web/pull/12",
  createdAt: at("2026-08-01T00:00:00Z"),
  archivedAt: null,
  triggers: { sync: null, publish: null },
  // 지금의 보류 사유 — 호출부의 `planHomeHold` 결론이다(ux-drift-unify Q6). 마지막 사건이 아니다.
  held: null,
};

const kinds = (input: Parameters<typeof metaRows>[0]) => metaRows(input).map((r) => r.kind);
const row = (input: Parameters<typeof metaRows>[0], kind: string) => metaRows(input).find((r) => r.kind === kind);

describe("metaRows — 아홉 행", () => {
  it("순서가 고정이다", () => {
    expect(kinds(base)).toEqual([
      "repository", "branch", "surfaces", "locales", "keys", "members", "lastSync", "lastPublish", "created",
    ]);
  });

  it("리포 행은 주소와 링크를 든다", () => {
    expect(row(base, "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web",
      href: "https://github.com/acme/web", disconnected: false,
    });
  });

  /** ⚠️ **표면이 하나면 그 행이 사라진다** — `1`이라고 적는 것은 정보가 아니다. */
  it("표면이 하나면 표면 행을 그리지 않는다", () => {
    expect(kinds({ ...base, surfaces: 1 })).not.toContain("surfaces");
    expect(kinds({ ...base, surfaces: 2 })).toContain("surfaces");
  });

  it("Publish 행이 PR 링크를 든다 — 없으면 시각만이다", () => {
    expect(row(base, "lastPublish")).toEqual({
      kind: "lastPublish", at: at("2026-09-13T00:00:00Z"), prUrl: "https://github.com/acme/web/pull/12", trigger: null,
    });
    expect(row({ ...base, lastPublishedAt: null, lastPrUrl: null }, "lastPublish")).toEqual({
      kind: "lastPublish", at: null, prUrl: null, trigger: null,
    });
  });
});

describe("metaRows — 상태가 행을 바꾼다", () => {
  /**
   * ⚠️ **`2c`에서 리포 링크가 사라진다** — 그 주소는 지금 우리가 읽을 수 없는 자리이고, 링크로 두면
   * 화면이 "여기 있다"고 말한다. pill이 그 자리를 대신한다.
   */
  it("미연결이면 리포 링크가 빠지고 pill이 선다", () => {
    expect(row({ ...base, state: "not_connected" }, "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web", disconnected: true, problem: "not-connected",
    });
  });

  /**
   * ⚠️ **타입이 어긋난 조합을 막는다** — 전에는 `href: string | null`과 `disconnected: boolean`이 따로
   * 서서 **연결됐다고 말하면서 주소가 없는 행**을 만들 수 있었고, 화면은 그것을 파랑 글자 + 외부 링크
   * 모양인데 **포커스를 못 받는 요소**로 그렸다. 도달 불가를 지키던 것은 타입이 아니라 `metaRows`의
   * 한 줄이었다. 아래 두 단언은 런타임이 아니라 **컴파일러**가 센다.
   */
  it("연결됐다고 말하면서 주소가 없는 행은 타입이 거부한다", () => {
    // @ts-expect-error — `disconnected: false`면 `href`가 필수다.
    const broken: MetaRow = { kind: "repository", owner: "acme", name: "web", disconnected: false };
    // @ts-expect-error — `disconnected: true`에는 `href` 자리가 없다.
    const alsoBroken: MetaRow = { kind: "repository", owner: "acme", name: "web", disconnected: true, href: "https://example.com" };
    expect([broken, alsoBroken].every(r => r.kind === "repository")).toBe(true);
  });

  it("Sync 실패면 마지막 Sync 행이 값 둘을 든다 — 성공 시각과 실패 시각", () => {
    const failed = { ...base, state: "import_failed" as const, lastImportFailedAt: at("2026-09-15T09:00:00Z"), lastImportError: "import-failed" as const };
    expect(row(failed, "lastSync")).toEqual({
      kind: "lastSync", at: at("2026-09-14T00:00:00Z"), failed: { at: at("2026-09-15T09:00:00Z"), state: "syncFailed" }, trigger: null, held: null,
    });
    expect(row(base, "lastSync")).toEqual({ kind: "lastSync", at: at("2026-09-14T00:00:00Z"), failed: null, trigger: null, held: null });
  });

  /** 🔴 A2 — 일부 반영은 데이터가 들어간 적재다. 메타 열이 그것을 "failed"로 말하지 않는다(DESIGN §2.4). */
  it("일부 반영이면 실패가 아니라 partiallySynced다", () => {
    const partial = { ...base, state: "import_failed" as const, lastImportFailedAt: at("2026-09-15T09:00:00Z"), lastImportError: "partial-import" as const };
    expect(row(partial, "lastSync")).toMatchObject({ failed: { at: at("2026-09-15T09:00:00Z"), state: "partiallySynced" } });
  });

  /**
   * ⚠️ **실행자를 적지 않는다** (DESIGN §6.64 이탈 표) — 캔버스의 `· by Sinhyeok`을 뺀 **의도된 이탈**이다.
   * 보관은 OWNER만 할 수 있고 멤버 상한이 10이라 "누가"의 값이 낮다.
   */
  it("보관이면 행이 하나 늘고 시각만 든다", () => {
    const archived = { ...base, state: "archived" as const, archivedAt: at("2026-09-12T00:00:00Z") };
    expect(kinds(archived)).toEqual([
      "repository", "branch", "surfaces", "locales", "keys", "members", "lastSync", "lastPublish", "created", "archived",
    ]);
    expect(row(archived, "archived")).toEqual({ kind: "archived", at: at("2026-09-12T00:00:00Z") });
  });

  /** 보관 시각이 없으면 그 행도 없다 — 시각 없는 사건을 세우지 않는다(활동 스트림과 같은 규칙). */
  it("보관 상태여도 시각이 없으면 행을 만들지 않는다", () => {
    expect(kinds({ ...base, state: "archived", archivedAt: null })).not.toContain("archived");
  });
});

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

describe("metaRows — 주체", () => {
  it("주체와 보류가 메타 행에 실린다", () => {
    const rows = metaRows({ ...base, triggers: { sync: "nightly", publish: "ci" }, held: "open-pr" });
    expect(rows.find((r) => r.kind === "lastSync")).toMatchObject({ trigger: "nightly", held: "open-pr" });
    expect(rows.find((r) => r.kind === "lastPublish")).toMatchObject({ trigger: "ci" });
  });
});

/**
 * **보류는 지금의 판정이다** (ux-drift-unify Q6 · 6-Y10) — 사유 셋이 그대로 실린다. 판정(게이트와 같은 입력 · 보관·끊김 → 없음)은
 * `planHomeHold`(`cards.test.ts`)가 든다. 마지막 사건으로 판정하던 때는 PR이 닫혀도 옛 보류가 남을 수 있었다.
 */
describe("metaRows — 보류", () => {
  it.each(["pending-edits", "open-pr", "pr-check-failed", null] as const)("%s가 Last sync 행에 실린다", (held) => {
    const found = metaRows({ ...base, held }).find((r) => r.kind === "lastSync");
    expect(found?.kind === "lastSync" ? found.held : "no-row").toBe(held);
  });
});
