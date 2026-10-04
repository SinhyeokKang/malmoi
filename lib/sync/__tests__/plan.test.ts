import { describe, expect, it } from "vitest";

import { AppError, MissingEnvError, classifyFailure } from "@/lib/failure";

import {
  PUBLISH_MIN_INTERVAL_SECONDS,
  STALE_AFTER_SECONDS,
  SYNC_ERROR_CODES,
  classifySyncError,
  planSyncFinish,
  planSyncStart,
  planWriteLock,
} from "../plan";

/**
 * sync 실행의 순수 판정 셋 (ARCHITECTURE §5.6).
 *
 * **I/O가 0이라 여기서 전부 잴 수 있다.** 껍데기(`runSync`, ship 2)는 이 판정을 트랜잭션과
 * 행 쓰기로 감쌀 뿐이고, "돌려도 되는가"·"무엇으로 끝났는가"의 답은 전부 이 파일이 낸다.
 */

const NOW = new Date("2026-09-10T12:00:00.000Z");

/** `now`에서 `seconds`만큼 과거. 테스트가 뺄셈을 매번 다시 쓰지 않는다. */
function ago(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe("상수 — 값이 아니라 관계가 계약이다", () => {
  it("⚠️ STALE_AFTER_SECONDS가 maxDuration(60)보다 넉넉하다", () => {
    // 같거나 작으면 **정상 실행이 스스로를 stale로 보고** 두 번째 실행을 허용한다 (ARCHITECTURE §5.6.2).
    expect(STALE_AFTER_SECONDS).toBeGreaterThan(60);
  });

  it("게시 최소 간격이 있다", () => {
    expect(PUBLISH_MIN_INTERVAL_SECONDS).toBe(30);
  });
});

describe("planSyncStart — 돌려도 되는가", () => {
  it("아무것도 없으면 ok, 닫을 stale도 없다", () => {
    expect(planSyncStart({ now: NOW, running: null, lastSettled: null, trigger: "manual", activeImport: null })).toEqual({
      status: "ok",
      staleToClose: false,
    });
  });

  it("RUNNING 행이 있으면 already-running이다", () => {
    expect(
      planSyncStart({ now: NOW, running: { startedAt: ago(5) }, lastSettled: null, trigger: "manual", activeImport: null }),
    ).toEqual({ status: "already-running" });
  });

  it("⚠️ already-running이 too-soon보다 앞이다 — 둘 다 걸려도 '지금 돌고 있다'가 답이다", () => {
    // 순서가 뒤집히면 두 탭 동시 클릭의 둘째가 "30초 뒤에 다시"를 보는데, 그건 거짓이다 —
    // 30초를 기다려도 첫 실행이 안 끝났으면 또 거부된다.
    expect(
      planSyncStart({
        now: NOW,
        running: { startedAt: ago(5) },
        lastSettled: { finishedAt: ago(1) },
        trigger: "manual", activeImport: null,
      }),
    ).toEqual({ status: "already-running" });
  });

  it("stale한 RUNNING은 실행 중으로 안 친다 — ok + staleToClose", () => {
    expect(
      planSyncStart({
        now: NOW,
        running: { startedAt: ago(STALE_AFTER_SECONDS + 1) },
        lastSettled: null,
        trigger: "manual", activeImport: null,
      }),
    ).toEqual({ status: "ok", staleToClose: true });
  });

  it("경계 정각은 아직 stale이 아니다 — 진행 중인 실행을 뺏지 않는다", () => {
    expect(
      planSyncStart({
        now: NOW,
        running: { startedAt: ago(STALE_AFTER_SECONDS) },
        lastSettled: null,
        trigger: "manual", activeImport: null,
      }),
    ).toEqual({ status: "already-running" });
  });

  it("직전 성공이 최소 간격 안이면 too-soon이고, 남은 초를 값으로 준다", () => {
    // ⚠️ 문구가 상수를 따로 들면 둘이 갈린다. `pullMessage`는 결정성 테스트 아래라
    // `Date.now()`를 못 보므로 이 수가 outcome에 실려야 한다 (ARCHITECTURE §5.6.2).
    expect(
      planSyncStart({ now: NOW, running: null, lastSettled: { finishedAt: ago(10) }, trigger: "manual", activeImport: null }),
    ).toEqual({ status: "too-soon", retryAfterSeconds: 20 });
  });

  it("남은 초는 올림이다 — 내림하면 0초를 안내하고 다시 거부된다", () => {
    expect(
      planSyncStart({ now: NOW, running: null, lastSettled: { finishedAt: ago(29.4) }, trigger: "manual", activeImport: null }),
    ).toEqual({ status: "too-soon", retryAfterSeconds: 1 });
  });

  it("간격 정각은 통과다", () => {
    expect(
      planSyncStart({
        now: NOW,
        running: null,
        lastSettled: { finishedAt: ago(PUBLISH_MIN_INTERVAL_SECONDS) },
        trigger: "manual", activeImport: null,
      }),
    ).toEqual({ status: "ok", staleToClose: false });
  });

  it("⚠️ too-soon은 cron에 안 걸린다 — 야간 실행이 조용히 안 도는 경로를 만들지 않는다", () => {
    expect(
      planSyncStart({ now: NOW, running: null, lastSettled: { finishedAt: ago(1) }, trigger: "cron", activeImport: null }),
    ).toEqual({ status: "ok", staleToClose: false });
  });

  it("⚠️ 직전이 FAILED면(lastSettled: null) too-soon에 안 걸린다 — 제한은 재시도 억제가 아니다", () => {
    // 30초는 "리포에 쓴 뒤 쉬는 간격"이다. 아무것도 못 썼는데 기다리게 하면 사람이 손을 못 쓴다.
    expect(
      planSyncStart({ now: NOW, running: null, lastSettled: null, trigger: "manual", activeImport: null }),
    ).toEqual({ status: "ok", staleToClose: false });
  });

  it("stale 닫기와 too-soon이 같이 걸리면 too-soon이다 — 행을 만들 자격이 먼저다", () => {
    expect(
      planSyncStart({
        now: NOW,
        running: { startedAt: ago(STALE_AFTER_SECONDS + 1) },
        lastSettled: { finishedAt: ago(1) },
        trigger: "manual", activeImport: null,
      }),
    ).toEqual({ status: "too-soon", retryAfterSeconds: 29 });
  });
});

describe("planSyncFinish — 결과를 행으로", () => {
  it("committed는 SUCCEEDED이고 prUrl·changed를 든다", () => {
    expect(
      planSyncFinish({
        status: "committed",
        delivered: 1,
        pr: "created",
        commitSha: "abc",
        prUrl: "https://github.com/o/r/pull/1",
        changed: ["a.json", "b.json"],
        changedValues: 7,
      }),
    ).toEqual({
      status: "SUCCEEDED",
      errorCode: null,
      retryable: null,
      prUrl: "https://github.com/o/r/pull/1",
      changed: 2,
      changedValues: 7,
      warnings: 0,
      withheld: 0,
    });
  });

  it("⚠️ skipped를 SUCCEEDED로 접지 않는다 — logs가 '보낼 게 없었다'와 '보냈다'를 갈라야 한다", () => {
    // `lastPublishedAt`이 skipped에서 안 움직인다(`lib/pull/load.ts`). 그 구별이 행에도 남는다.
    expect(planSyncFinish({ status: "skipped", reason: "no-edits" })).toEqual({
      status: "SKIPPED",
      errorCode: null,
      retryable: null,
      prUrl: null,
      changed: 0,
      changedValues: 0,
      warnings: 0,
      withheld: 0,
    });
  });

  it("⚠️ writer 경고로 멈춘 실행은 SKIPPED이고 경고 수를 센다 — 버린 값을 숨기지 않는다 (sync-edit-protection T10)", () => {
    expect(
      planSyncFinish({ status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "a", path: "x.json", code: "root-not-object" }, { surfaceSlug: "b", path: "y.json", code: "root-not-object" }] }),
    ).toMatchObject({ status: "SKIPPED", warnings: 2, prUrl: null });
  });

  it("thrown은 FAILED이고 changed·prUrl이 null이다 — 0이 아니다", () => {
    // 0은 "아무것도 안 바뀌었다"는 **관측**이고, 실패는 관측 자체가 없다. 접으면 logs가 거짓말한다.
    expect(planSyncFinish({ thrown: new AppError("boom") })).toEqual({
      status: "FAILED",
      errorCode: "unknown",
      retryable: true,
      prUrl: null,
      changed: null,
      changedValues: null,
      warnings: 0,
      withheld: 0,
    });
  });

  it("thrown이 코드를 든 AppError면 그 코드가 행에 남는다", () => {
    expect(planSyncFinish({ thrown: new AppError("no install", "not-installed") })).toMatchObject({
      status: "FAILED",
      errorCode: "not-installed",
      retryable: false,
    });
  });
});

describe("classifySyncError — 안정적 오류 코드", () => {
  it("던지는 자리가 든 코드가 그대로 나온다 — 문자열 매칭이 아니다", () => {
    expect(classifySyncError(new AppError("cannot read the base branch: main", "base-unreadable"))).toMatchObject(
      { code: "base-unreadable" },
    );
    expect(classifySyncError(new AppError("the glob matched no files: x", "glob-matched-nothing"))).toMatchObject(
      { code: "glob-matched-nothing" },
    );
  });

  it("⚠️ 코드 없는 AppError는 unknown이다 — 메시지로 추측하지 않는다", () => {
    // pull 실패는 전부 메시지만 다른 `AppError`라, 문구 매칭은 문장 하나가 바뀌면 무너진다.
    expect(classifySyncError(new AppError("unreachable: maxUpdatedAt is null"))).toMatchObject({
      code: "unknown",
    });
  });

  it("octokit 오류는 github-error다 — status를 든 모양으로 가른다", () => {
    const err = Object.assign(new Error("Not Found"), { status: 404, name: "HttpError" });
    expect(classifySyncError(err)).toMatchObject({ code: "github-error", retryable: true });
  });

  it("Prisma 오류는 db-unavailable이다", () => {
    const err = Object.assign(new Error("Can't reach database server at `pooler`"), {
      name: "PrismaClientInitializationError",
    });
    expect(classifySyncError(err)).toMatchObject({ code: "db-unavailable", retryable: true });
  });

  it("모르는 것은 unknown이고 재시도 가능이다 — 사람이 고칠 것이 없다", () => {
    expect(classifySyncError("문자열을 던졌다")).toMatchObject({ code: "unknown", retryable: true });
  });

  it("⚠️ retryable이 갈린다 — 설정을 고쳐야 하는 것은 다시 해도 같다", () => {
    expect(classifySyncError(new AppError("x", "not-installed")).retryable).toBe(false);
    expect(classifySyncError(new AppError("x", "base-unreadable")).retryable).toBe(false);
    expect(classifySyncError(new AppError("x", "glob-matched-nothing")).retryable).toBe(false);
    expect(classifySyncError(new AppError("x", "db-unavailable")).retryable).toBe(true);
    expect(classifySyncError(new AppError("x", "stale")).retryable).toBe(true);
  });

  it("safeMessage가 classifyFailure의 판정과 같다 — 안전 규칙이 두 벌이 되지 않는다", () => {
    const ours = new AppError("Project.installationId is empty (demo)", "not-installed");
    expect(classifySyncError(ours).safeMessage).toBe("Project.installationId is empty (demo)");
    expect(classifyFailure(ours)).toEqual({ safe: true, message: ours.message });

    const theirs = new Error("Can't reach database server at `aws-0.pooler.supabase.com:5432`");
    // ⚠️ 남의 메시지는 null이다 — 이 값이 대상 리포의 public Actions 로그로 흘러간다.
    expect(classifySyncError(theirs).safeMessage).toBeNull();
    expect(classifyFailure(theirs).safe).toBe(false);
  });

  it("MissingEnvError도 안전하다 — 변수 이름뿐이다", () => {
    expect(classifySyncError(new MissingEnvError("GITHUB_APP_ID is missing")).safeMessage).toContain(
      "GITHUB_APP_ID",
    );
  });

  it("코드 목록에 생산자 없는 값이 없다 — 목록이 곧 union이다", () => {
    expect([...SYNC_ERROR_CODES]).toEqual([
      "base-unreadable",
      "not-installed",
      "glob-matched-nothing",
      "github-error",
      "db-unavailable",
      "stale",
      "unknown",
      "reconfirm",
    ]);
  });
});

describe("planSyncStart — 수동 Sync와의 상호 배제 (sync-edit-protection — ARCHITECTURE §5.6.1)", () => {
  const base = { now: NOW, running: null, lastSettled: null, trigger: "manual" as const };

  it("진행 중인 수동 Sync가 있으면 Publish는 already-running이다 (없음 → ok 대조)", () => {
    expect(planSyncStart({ ...base, activeImport: { startedAt: ago(5) } })).toEqual({ status: "already-running" });
    expect(planSyncStart({ ...base, activeImport: null })).toEqual({ status: "ok", staleToClose: false });
  });

  it("stale한 수동 Sync는 막지 않는다 — 죽은 프로세스의 표시가 Publish를 영구히 잠그면 안 된다", () => {
    expect(planSyncStart({ ...base, activeImport: { startedAt: ago(STALE_AFTER_SECONDS + 1) } })).toEqual({ status: "ok", staleToClose: false });
  });

  it("cron도 같은 배제를 받는다", () => {
    expect(planSyncStart({ ...base, trigger: "cron", activeImport: { startedAt: ago(5) } })).toEqual({ status: "already-running" });
  });

  /**
   * ⚠️ **stale 경계가 두 벌이면 한쪽은 막고 한쪽은 여는 1밀리초가 생긴다** — 그 창에서 Sync와 Publish가 동시에 돈다.
   * 경계 정각과 1ms 뒤에서 두 판정이 **같은 답**을 내는지 교차로 센다.
   */
  it.each([0, STALE_AFTER_SECONDS * 1000, STALE_AFTER_SECONDS * 1000 + 1])("양쪽 stale 경계가 같다 — %s ms", async (age) => {
    const { planRepositoryImport } = await import("@/lib/import/plan");
    const startedAt = new Date(NOW.getTime() - age);
    const publishBlocked = planSyncStart({ ...base, activeImport: { startedAt } }).status === "already-running";
    const importBlocked = !planRepositoryImport({
      now: NOW, readiness: "ready", identity: "ok", repositoryImportToken: null, repositoryImportStartedAt: null,
      surfaces: [{ id: "s", slug: "default", archivedAt: null, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastImportStartedAt: null }],
      runningSync: { startedAt },
    }).ok;
    expect(publishBlocked).toBe(importBlocked);
    expect(publishBlocked).toBe(age <= STALE_AFTER_SECONDS * 1000);
  });
});

/**
 * **보류 수는 `SyncRun.withheld`에 산다** (delivery-invariants D7 · 사용자 결정 2026-09-24). 결과 모달과 Logs가 같은 수를 말하는 자리이고,
 * Publish 사건 payload에 복제하지 않는다(logs-rework 결정 1). 버린 것(`warnings`)과 섞지 않는다 — 보류는 토큰이 남아 다음 Publish를 기다린다.
 */
describe("planSyncFinish — 보류 수", () => {
  const committed = { status: "committed", delivered: 1, pr: "created", commitSha: "c", prUrl: "https://github.com/o/r/pull/1", changed: ["a.yml"] as string[], changedValues: 1 } as const;
  it("committed · no-changes · skipped/withheld는 사유를 합친 보류 수를 싣는다", () => {
    expect(planSyncFinish({ ...committed, withheld: { file: 1, key: 2 } })).toMatchObject({ status: "SUCCEEDED", withheld: 3, warnings: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } })).toMatchObject({ status: "SKIPPED", withheld: 1 });
    expect(planSyncFinish({ status: "skipped", reason: "withheld", withheld: { file: 0, key: 1 } })).toMatchObject({ status: "SKIPPED", withheld: 1, changed: 0 });
  });
  it("보류가 없거나 실패면 0이다 (짝)", () => {
    expect(planSyncFinish(committed)).toMatchObject({ withheld: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "web", path: "x.json", code: "root-not-object" }] })).toMatchObject({ withheld: 0, warnings: 1 });
    expect(planSyncFinish({ thrown: new Error("x") })).toMatchObject({ withheld: 0 });
  });
});

/** B1 r3 — no-changes 실행이 닫은 PR은 SKIPPED 행의 `prUrl`로 남는다. 스킵 행에 prUrl이 선 적이 없어 뜻이 겹치지 않는다. */
describe("planSyncFinish — 닫은 PR", () => {
  it("no-changes + closedPr → SKIPPED · prUrl이 닫은 PR이다 · 없으면 null (짝)", () => {
    expect(planSyncFinish({ status: "skipped", reason: "no-changes", closedPr: { number: 4, url: "https://github.com/o/r/pull/4" } }))
      .toMatchObject({ status: "SKIPPED", prUrl: "https://github.com/o/r/pull/4", changed: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "no-changes" })).toMatchObject({ prUrl: null });
  });
});

/**
 * **Publish가 바꾼 값 수** (project-card-tabs design §2.3). `changed`(파일 수)와 짝이다 — 커밋은 센 수 · 스킵은 0, 관측이 없는 실행(실패·렌더 전에
 * 멈춘 reconfirm)은 `null`. 0은 "바뀐 값이 없었다"는 관측이고 null은 관측 자체가 없다. ⚠️ 관측값이라 판정에 쓰지 않는다.
 */
describe("planSyncFinish — changedValues", () => {
  it("committed는 센 수를 그대로 싣는다 — 표현만 바뀐 커밋의 0도 그대로다", () => {
    const committed = { status: "committed", delivered: 1, pr: "updated", commitSha: "c", prUrl: "https://github.com/o/r/pull/1", changed: ["a.yml"] as string[] } as const;
    expect(planSyncFinish({ ...committed, changedValues: 24 })).toMatchObject({ status: "SUCCEEDED", changedValues: 24 });
    expect(planSyncFinish({ ...committed, changedValues: 0 })).toMatchObject({ status: "SUCCEEDED", changed: 1, changedValues: 0 });
  });
  it("스킵(no-edits · no-changes · withheld · writer-warnings)은 0이다", () => {
    expect(planSyncFinish({ status: "skipped", reason: "no-edits" })).toMatchObject({ changedValues: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "no-changes" })).toMatchObject({ changedValues: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } })).toMatchObject({ changedValues: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "web", path: "x.json", code: "root-not-object" }] })).toMatchObject({ changedValues: 0 });
  });
  it("실패·reconfirm은 null이다 — 0으로 접지 않는다 (짝)", () => {
    expect(planSyncFinish({ thrown: new Error("x") })).toMatchObject({ changed: null, changedValues: null });
    expect(planSyncFinish({ status: "skipped", reason: "reconfirm" })).toMatchObject({ changed: null, changedValues: null });
  });
  it("커밋했는데 집계가 던졌으면(null) SUCCEEDED 그대로 null을 싣는다 — 관측 실패가 실행 실패가 아니다", () => {
    const committed = { status: "committed", delivered: 1, pr: "created", commitSha: "c", prUrl: "https://github.com/o/r/pull/1", changed: ["a.yml"] as string[] } as const;
    expect(planSyncFinish({ ...committed, changedValues: null })).toMatchObject({ status: "SUCCEEDED", errorCode: null, changed: 1, changedValues: null });
  });
});

/**
 * **reconfirm은 리포에 아무것도 안 쓴 스킵이다** (mcp-connector T6.5 · design §3.1). `SKIPPED`로 닫되 `errorCode`로 표시해 `too-soon`의 기준에서
 * 뺀다(`lib/sync/run.ts`) — 표시가 없으면 에이전트가 새 미리보기로 재호출해도 30초를 기다린다. `FAILED`로 닫지 않는다: Revert의 settled
 * 판정(`lib/keys/revert.ts`)이 FAILED를 "썼을 수 있는 실행"으로 센다. 렌더를 안 했으니 `changed`는 관측 없음(`null`)이다.
 */
describe("planSyncFinish — reconfirm", () => {
  it("SKIPPED + errorCode reconfirm · 재시도 가능 · changed null", () => {
    expect(planSyncFinish({ status: "skipped", reason: "reconfirm" })).toEqual({
      status: "SKIPPED", errorCode: "reconfirm", retryable: true, prUrl: null, changed: null, changedValues: null, warnings: 0, withheld: 0,
    });
  });

  it("다른 스킵은 errorCode가 없다 (짝)", () => {
    expect(planSyncFinish({ status: "skipped", reason: "no-edits" })).toMatchObject({ status: "SKIPPED", errorCode: null });
  });
});

/**
 * **번역 쓰기 잠금** (sync-lock design §2). 수동 Sync·야간 적재의 lease(`Project.repositoryImportToken`·`repositoryImportStartedAt`)가 살아 있는
 * 동안 저장·Revert를 거부한다. 경계는 Publish 게이트와 같은 `isRunActive`다 — 정각은 활성이다.
 */
describe("planWriteLock — 적재 lease가 번역 쓰기를 막는가", () => {
  const lease = (age: number, token: string | null = "t") => ({ now: NOW, repositoryImportToken: token, repositoryImportStartedAt: new Date(NOW.getTime() - age) });

  it("lease가 없으면 null이다 — 토큰만 비어도(시각이 남아도) 없다", () => {
    expect(planWriteLock({ now: NOW, repositoryImportToken: null, repositoryImportStartedAt: null })).toBeNull();
    expect(planWriteLock(lease(5_000, null))).toBeNull();
    expect(planWriteLock({ now: NOW, repositoryImportToken: "t", repositoryImportStartedAt: null })).toBeNull();
  });

  it("살아 있으면 sync-running과 시작 시각을 낸다", () => {
    expect(planWriteLock(lease(100_000))).toEqual({ reason: "sync-running", startedAt: ago(100), reopensBy: expect.any(Date) });
  });

  it("경계 정각은 아직 활성이고, 1ms 뒤에 풀린다", () => {
    expect(planWriteLock(lease(STALE_AFTER_SECONDS * 1000))).not.toBeNull();
    expect(planWriteLock(lease(300_001))).toBeNull();
  });

  /** ⚠️ Publish 게이트와 경계가 두 벌이면 한쪽만 막는 1ms가 생긴다 — 같은 입력에서 같은 답이어야 한다. */
  it.each([0, STALE_AFTER_SECONDS * 1000, STALE_AFTER_SECONDS * 1000 + 1])("Publish 게이트(planSyncStart)와 같은 경계다 — %s ms", age => {
    const startedAt = new Date(NOW.getTime() - age);
    const publishBlocked = planSyncStart({ now: NOW, running: null, lastSettled: null, trigger: "manual", activeImport: { startedAt } }).status === "already-running";
    expect(planWriteLock({ now: NOW, repositoryImportToken: "t", repositoryImportStartedAt: startedAt }) !== null).toBe(publishBlocked);
  });

  /**
   * `reopensBy`는 표시용이다 — `utcMinute`이 초를 버리고 정각도 활성이라, 그대로 내면 표시가 실제보다 최대 59초 이르다. 그래서 다음 분으로 올린다.
   * 그 시각에는 반드시 풀려 있어야 한다.
   */
  it.each([
    ["2026-10-01T16:30:12.345Z", "2026-10-01T16:36:00.000Z"],
    ["2026-10-01T16:30:59.999Z", "2026-10-01T16:36:00.000Z"],
    ["2026-10-01T16:30:00.001Z", "2026-10-01T16:36:00.000Z"],
    // 만료 시각이 분 정각이면 그 분은 아직 활성이다 — 다음 분이다.
    ["2026-10-01T16:30:00.000Z", "2026-10-01T16:36:00.000Z"],
  ])("reopensBy는 만료 시각을 다음 분으로 올린다 — %s 시작 → %s", (startedAt, reopensBy) => {
    const start = new Date(startedAt);
    const lock = planWriteLock({ now: start, repositoryImportToken: "t", repositoryImportStartedAt: start });
    expect(lock?.reopensBy.toISOString()).toBe(reopensBy);
    expect(planWriteLock({ now: lock!.reopensBy, repositoryImportToken: "t", repositoryImportStartedAt: start })).toBeNull();
  });
});
