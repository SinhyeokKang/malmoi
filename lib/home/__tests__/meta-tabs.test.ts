import { describe, expect, it } from "vitest";

import {
  homeLastSync, homeLate, metaTabs,
  type HomePublishRun, type HomeSyncRun, type MetaTabs, type MetaTabsInput,
} from "../meta";

/**
 * Home 메타 열의 탭 셋 (project-card-tabs — spec "결정" · 시안 v3 보드 `1a`~`2h`).
 *
 * ⚠️ **한 행 = 라벨 하나 + 사실 하나** — 지금의 `Last sync` 한 줄은 주체·성공 시각·실패·보류가 붙어 어느 조각이 어느 사실인지 안 읽혔다.
 * ⚠️ **Sync 탭은 실행 하나의 사실이다** — 입력이 실행 하나(`HomeSyncRun`)뿐이라 다른 소스의 시각·실패가 들어올 자리가 없다(spec 문제 3).
 */

const at = (iso: string): Date => new Date(iso);

const syncRun: HomeSyncRun = {
  trigger: "nightly", at: at("2026-10-03T18:05:00Z"), result: "imported",
  changedValues: 128, keys: 903, surfaceSlugs: ["mobile", "web"],
};
const publishRun: HomePublishRun = {
  trigger: "manual", at: at("2026-10-02T09:00:00Z"), prUrl: "https://github.com/acme/web/pull/127",
  changedValues: 24, surfaceSlugs: ["mobile", "web"],
};

/** 보드 `1a` — 기본 · 소스 둘. */
const base: MetaTabsInput = {
  repository: { owner: "acme", name: "web", branch: "main", connection: "connected" },
  ciConfigured: true,
  surfaceCount: 2,
  keys: 903,
  members: 4,
  pendingInvites: 2,
  createdAt: at("2026-08-01T00:00:00Z"),
  archivedAt: null,
  lastSync: syncRun,
  lastPublish: publishRun,
  held: null,
  prState: "pending",
};

type Tab = keyof MetaTabs;
const shape = (input: MetaTabsInput, tab: Tab) => metaTabs(input)[tab].map((group) => group.map((row) => row.kind));
const flat = (input: MetaTabsInput, tab: Tab) => metaTabs(input)[tab].flat();
const find = (input: MetaTabsInput, tab: Tab, kind: string) => flat(input, tab).find((row) => row.kind === kind);

describe("metaTabs — 보드별 묶음·행 (시안 v3)", () => {
  it("1a 기본 · 소스 둘", () => {
    expect(shape(base, "project")).toEqual([
      ["repository", "connection", "branch", "ci"],
      ["sources", "keys", "members"],
      ["created"],
    ]);
    expect(shape(base, "sync")).toEqual([
      ["lastSync", "synced", "result"],
      ["changed", "keysSeen", "sources"],
    ]);
    expect(shape(base, "publish")).toEqual([
      ["lastPublish", "published", "pullRequest", "prState"],
      ["changed", "sources"],
    ]);
  });

  /** ⚠️ **Project `Sources`는 소스 하나여도 선다** — Keys가 몇 개의 합인지 말한다(옛 `> 1` 규칙을 뒤집는다). Sync·Publish `Sources`는 둘 이상일 때만. */
  it("1b 기본 · 소스 하나 — Project Sources는 남고 Sync·Publish Sources는 없다", () => {
    const one: MetaTabsInput = {
      ...base, surfaceCount: 1,
      lastSync: { ...syncRun, surfaceSlugs: ["web"] },
      lastPublish: { ...publishRun, surfaceSlugs: ["web"] },
    };
    expect(shape(one, "project")[1]).toEqual(["sources", "keys", "members"]);
    expect(find(one, "project", "sources")).toEqual({ kind: "sources", count: 1 });
    expect(shape(one, "sync")).toEqual([["lastSync", "synced", "result"], ["changed", "keysSeen"]]);
    expect(shape(one, "publish")).toEqual([["lastPublish", "published", "pullRequest", "prState"], ["changed"]]);
  });

  it("2a 첫 Sync 전 — Sync 탭은 notSyncedYet 한 행", () => {
    const fresh: MetaTabsInput = { ...base, lastSync: null, lastPublish: null, prState: "absent" };
    expect(metaTabs(fresh).sync).toEqual([[{ kind: "lastSync", value: "notSyncedYet" }]]);
  });

  /** Sync 실패·진행 중은 입력에 자리가 없다 — 실패는 배너가 든다. 마지막 성공 실행이 그대로 선다. */
  it("2b Sync 실패 — 실패·진행 중 입력이 없어 카드가 불변이다", () => {
    for (const key of ["lastImportFailedAt", "lastImportError", "importing", "failed", "state"]) expect(Object.keys(base)).not.toContain(key);
    // @ts-expect-error — 실패를 실을 자리가 타입에 없다.
    const failed: MetaTabsInput = { ...base, lastImportFailedAt: at("2026-10-04T00:00:00Z") };
    expect(failed.lastSync).toBe(syncRun);
  });

  /** 일부 반영은 성공 실행이다 — `Result`만 호박(`partiallySynced`)이다. */
  it("2b′ 일부 반영 — Result만 partiallySynced", () => {
    const partial: MetaTabsInput = { ...base, lastSync: { ...syncRun, result: "partial" } };
    expect(find(partial, "sync", "result")).toEqual({ kind: "result", state: "partiallySynced" });
    expect(find(base, "sync", "result")).toEqual({ kind: "result", state: "synced" });
    expect(shape(partial, "sync")).toEqual(shape(base, "sync"));
  });

  /** ⚠️ **미연결이면 GitHub 링크 둘이 평문이다** — 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. 상태는 Connection 행이 든다. */
  it.each(["notConnected", "disconnected", "wrongRepository"] as const)("2c 미연결(%s) — Repository·Pull request 평문, Connection이 상태", (connection) => {
    const off: MetaTabsInput = { ...base, repository: { ...base.repository, connection }, prState: "absent" };
    expect(find(off, "project", "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web", href: "https://github.com/acme/web", linked: false,
    });
    expect(find(off, "project", "connection")).toEqual({ kind: "connection", state: connection });
    expect(find(off, "publish", "pullRequest")).toEqual({ kind: "pullRequest", href: "https://github.com/acme/web/pull/127", linked: false });
  });

  it("2d 보관 — Created 묶음에 Archived가 붙고 시각만 든다", () => {
    const archived: MetaTabsInput = { ...base, archivedAt: at("2026-09-12T00:00:00Z"), prState: "absent" };
    expect(shape(archived, "project")[2]).toEqual(["created", "archived"]);
    expect(find(archived, "project", "archived")).toEqual({ kind: "archived", at: at("2026-09-12T00:00:00Z") });
  });

  it("2f 발송 전 — Publish 탭은 Never 한 행이고 PR state 자리도 없다", () => {
    expect(metaTabs({ ...base, lastPublish: null }).publish).toEqual([[{ kind: "lastPublish", value: "never" }]]);
  });

  /**
   * 2g 늦게 오는 행 — 첫 렌더에 아는 보류는 Sync 탭 마지막 묶음 끝에 선다(자리를 잡지 않는다).
   * PR state는 조회하는 갈래(`pending`)면 자리(스켈레톤)를 먼저 잡고, 조회하지 않으면 행이 없다.
   */
  it("2g 늦게 오는 행 — Hold는 끝에 붙고 PR state는 pending일 때만 자리를 잡는다", () => {
    const held = metaTabs({ ...base, held: "pending-edits" }).sync;
    expect(held.at(-1)?.at(-1)).toEqual({ kind: "hold", reason: "pending-edits" });
    expect(flat(base, "sync").map((row) => row.kind)).not.toContain("hold");
    expect(find(base, "publish", "prState")).toEqual({ kind: "prState" });
    expect(find({ ...base, prState: "absent" }, "publish", "prState")).toBeUndefined();
  });

  /** 행은 역할과 무관하다 — 입력에 역할이 없다. 바닥 링크(`Settings ›`)만 `MetaColumn`이 역할로 고른다. */
  it("2h EDITOR — 입력에 역할 축이 없다(1a와 같은 행)", () => {
    expect(Object.keys(base)).not.toContain("role");
  });
});

describe("metaTabs — Project 탭", () => {
  it("리포 행은 연결이 정상이면 링크다", () => {
    expect(find(base, "project", "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web", href: "https://github.com/acme/web", linked: true,
    });
  });

  /** ⚠️ 모름(`couldNotCheck`)을 끊김으로 접지 않는다 — `planHomeState`가 조회 실패를 미연결로 접지 않는 것과 같은 축이다. */
  it("연결을 확인하지 못했으면 링크는 남고 Connection이 couldNotCheck다", () => {
    const unknown: MetaTabsInput = { ...base, repository: { ...base.repository, connection: "couldNotCheck" } };
    expect(find(unknown, "project", "repository")).toMatchObject({ linked: true });
    expect(find(unknown, "project", "connection")).toEqual({ kind: "connection", state: "couldNotCheck" });
  });

  it("Branch · CI · Keys · Created", () => {
    expect(find(base, "project", "branch")).toEqual({ kind: "branch", branch: "main" });
    expect(find(base, "project", "ci")).toEqual({ kind: "ci", configured: true });
    expect(find({ ...base, ciConfigured: false }, "project", "ci")).toEqual({ kind: "ci", configured: false });
    expect(find(base, "project", "keys")).toEqual({ kind: "keys", count: 903 });
    expect(find(base, "project", "created")).toEqual({ kind: "created", at: at("2026-08-01T00:00:00Z") });
  });

  /** ⚠️ **초대가 없어도 `(0)`이다** (2026-10-04 사용자 — 시안의 "0이면 괄호 없음"을 뒤집는다). */
  it("Members는 멤버 수와 대기 초대 수를 함께 든다 — 0도 값이다", () => {
    expect(find(base, "project", "members")).toEqual({ kind: "members", count: 4, pending: 2 });
    expect(find({ ...base, pendingInvites: 0 }, "project", "members")).toEqual({ kind: "members", count: 4, pending: 0 });
  });

  /** spec 문제 2의 회귀 — 로케일은 Sources 상세가 소유한다. 입력에도 출력에도 로케일이 없다. */
  it("로케일 행이 어느 탭에도 없다", () => {
    const all = (["project", "sync", "publish"] as const).flatMap((tab) => flat(base, tab).map((row) => row.kind));
    expect(all).not.toContain("locales");
    expect(Object.keys(base)).not.toContain("locales");
  });
});

describe("metaTabs — Sync 탭은 실행 하나의 사실이다", () => {
  it("모든 값이 같은 실행에서 온다", () => {
    expect(metaTabs(base).sync.flat()).toEqual([
      { kind: "lastSync", value: "nightly" },
      { kind: "synced", at: syncRun.at },
      { kind: "result", state: "synced" },
      { kind: "changed", values: 128 },
      { kind: "keysSeen", count: 903 },
      { kind: "sources", slugs: ["mobile", "web"] },
    ]);
  });

  /**
   * spec 문제 3의 회귀 — 옛 `Last sync`는 전 소스 `lastImportedAt` 최댓값과 가장 나쁜 소스의 실패를 한 줄에 섞었다.
   * 이제 시각은 고른 실행의 종료 시각뿐이고, 다른 소스의 시각이 들어올 입력이 없다.
   */
  it("Synced는 그 실행의 종료 시각이다 — 다른 입력이 바꾸지 못한다", () => {
    const keys = Object.keys(base).sort();
    expect(keys).toEqual([
      "archivedAt", "ciConfigured", "createdAt", "held", "keys", "lastPublish", "lastSync",
      "members", "pendingInvites", "prState", "repository", "surfaceCount",
    ]);
    expect(find(base, "sync", "synced")).toEqual({ kind: "synced", at: at("2026-10-03T18:05:00Z") });
  });

  /** malmoi#81과 같은 원칙 — 관측하지 않은 수를 `0`으로 접지 않는다. */
  it("null 수치는 행을 숨긴다 — 0은 값이다", () => {
    const unobserved: MetaTabsInput = { ...base, lastSync: { ...syncRun, changedValues: null, keys: null } };
    expect(shape(unobserved, "sync")).toEqual([["lastSync", "synced", "result"], ["sources"]]);
    const zero: MetaTabsInput = { ...base, lastSync: { ...syncRun, changedValues: 0 } };
    expect(find(zero, "sync", "changed")).toEqual({ kind: "changed", values: 0 });
  });

  it("수치도 소스도 없으면 둘째 묶음이 사라진다", () => {
    const bare: MetaTabsInput = { ...base, surfaceCount: 1, lastSync: { ...syncRun, changedValues: null, keys: null, surfaceSlugs: ["web"] } };
    expect(shape(bare, "sync")).toEqual([["lastSync", "synced", "result"]]);
  });

  /**
   * ⚠️ **`"unrecorded"`는 첫 Sync 전과 다른 사실이다** — 사건 기록(2026-09-20) 이전에 적재되고 그 뒤 시각을 전진시킨 실행이 없다.
   * `notSyncedYet`으로 접으면 거짓이다. 한 행(기록 없음)으로 선다.
   */
  it("unrecorded — Last sync 한 행이 기록 없음이다", () => {
    expect(metaTabs({ ...base, lastSync: "unrecorded" }).sync).toEqual([[{ kind: "lastSync", value: "unrecorded" }]]);
  });

  /** 보류는 실행의 사실이 아니라 지금의 판정이다 — 기록 없음 갈래에도 붙는다. */
  it.each(["pending-edits", "open-pr", "pr-check-failed"] as const)("보류(%s)는 Hold 행으로 선다", (held) => {
    expect(flat({ ...base, held }, "sync").at(-1)).toEqual({ kind: "hold", reason: held });
    expect(flat({ ...base, held, lastSync: "unrecorded" }, "sync")).toEqual([
      { kind: "lastSync", value: "unrecorded" }, { kind: "hold", reason: held },
    ]);
  });
});

describe("metaTabs — Publish 탭은 마지막 성공 Publish 하나의 사실이다", () => {
  it("모든 값이 같은 실행에서 온다", () => {
    expect(metaTabs(base).publish.flat()).toEqual([
      { kind: "lastPublish", value: "manual" },
      { kind: "published", at: publishRun.at },
      { kind: "pullRequest", href: "https://github.com/acme/web/pull/127", linked: true },
      { kind: "prState" },
      { kind: "changed", values: 24 },
      { kind: "sources", slugs: ["mobile", "web"] },
    ]);
  });

  it("PR 주소가 없으면 Pull request 행이 없다", () => {
    expect(shape({ ...base, lastPublish: { ...publishRun, prUrl: null } }, "publish")[0]).toEqual(["lastPublish", "published", "prState"]);
  });

  /** 기록 이전 실행은 `null` — 행이 없다(Logs는 `—`). 스킵의 `0`은 값이다. */
  it("Changed가 null이면 행이 없다 — 0은 값이다", () => {
    expect(find({ ...base, lastPublish: { ...publishRun, changedValues: null } }, "publish", "changed")).toBeUndefined();
    expect(find({ ...base, lastPublish: { ...publishRun, changedValues: 0 } }, "publish", "changed")).toEqual({ kind: "changed", values: 0 });
  });

  /** 백필된 옛 사건의 `[]`(ARCHITECTURE §5.7.5)는 "모른다"이다 — 빈 행을 세우지 않는다. */
  it("소스가 둘 이상이어도 기록이 비었으면 Sources 행이 없다", () => {
    expect(find({ ...base, lastPublish: { ...publishRun, surfaceSlugs: [] } }, "publish", "sources")).toBeUndefined();
    expect(find({ ...base, lastSync: { ...syncRun, surfaceSlugs: [] } }, "sync", "sources")).toBeUndefined();
  });
});

/**
 * Sync 탭 입력의 세 갈래 — 사건이 있으면 그 실행, 없으면 "적재된 적이 있나"가 첫 Sync 전과 기록 없음을 가른다.
 * ⚠️ `lastSyncTime`의 `"unrecorded"`(`lastImportedAt` 없음 + `lastCommitAt` 있음)와 **이름만 같은 별개 판정이다**.
 */
describe("homeLastSync", () => {
  const loaded = [{ lastImportedAt: at("2026-09-01T00:00:00Z"), archivedAt: null }, { lastImportedAt: null, archivedAt: null }];
  const never = [{ lastImportedAt: null, archivedAt: null }];

  it("실행이 있으면 그 실행이다 — 소스의 시각을 보지 않는다", () => {
    expect(homeLastSync(syncRun, loaded)).toBe(syncRun);
    expect(homeLastSync(syncRun, never)).toBe(syncRun);
  });

  it("실행이 없는데 어느 소스든 적재됐으면 unrecorded", () => {
    expect(homeLastSync(null, loaded)).toBe("unrecorded");
  });

  /** 보관한 소스의 옛 적재는 지금 프로젝트의 사실이 아니다 — 비보관 거르기를 호출부에 맡기지 않고 여기서 한다(판정을 한 곳에). */
  it("보관 소스만 적재됐으면 첫 Sync 전(null)", () => {
    expect(homeLastSync(null, [{ lastImportedAt: at("2026-09-01T00:00:00Z"), archivedAt: at("2026-09-02T00:00:00Z") }, ...never])).toBeNull();
  });

  it("실행도 적재도 없으면 첫 Sync 전(null)", () => {
    expect(homeLastSync(null, never)).toBeNull();
    expect(homeLastSync(null, [])).toBeNull();
  });
});

/**
 * **늦게 오는 사실 둘** (project-card-tabs — 리뷰 D 몫 1). PR 조회가 도는 갈래에서 `planHomeHold`의 결론 하나가 Hold와 PR state를 함께 정한다.
 * ⚠️ **새 GitHub 호출이 없다** — PR state는 보류 판정이 이미 부른 조회의 결과를 옮길 뿐이다.
 */
describe("homeLate — 보류 결론 → Hold · PR state", () => {
  it.each([
    ["open-pr", "prOpen"],
    [null, "notOpen"],
    ["pr-check-failed", "couldNotCheck"],
  ] as const)("%s → %s", (reason, prState) => {
    expect(homeLate(reason)).toEqual({ held: reason, prState });
  });

  /** PR 조회 갈래는 편집 0이라 도달 불가지만 — 편집 보류는 PR을 보지 않았으므로 PR state를 말하지 않는다. */
  it("pending-edits는 PR state를 모른다", () => {
    expect(homeLate("pending-edits")).toEqual({ held: "pending-edits", prState: null });
  });
});
