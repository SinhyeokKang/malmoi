import { describe, expect, it } from "vitest";

import { AppError, MissingEnvError, classifyFailure } from "@/lib/failure";

import {
  PUBLISH_MIN_INTERVAL_SECONDS,
  STALE_AFTER_SECONDS,
  SYNC_ERROR_CODES,
  classifySyncError,
  planSyncFinish,
  planSyncStart,
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
      }),
    ).toEqual({
      status: "SUCCEEDED",
      errorCode: null,
      retryable: null,
      prUrl: "https://github.com/o/r/pull/1",
      changed: 2,
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
      warnings: 0,
      withheld: 0,
    });
  });

  it("⚠️ writer 경고로 멈춘 실행은 SKIPPED이고 경고 수를 센다 — 버린 값을 숨기지 않는다 (sync-edit-protection T10)", () => {
    expect(
      planSyncFinish({ status: "skipped", reason: "writer-warnings", warnings: ["a: x", "b: y"] }),
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
  const committed = { status: "committed", delivered: 1, pr: "created", commitSha: "c", prUrl: "https://github.com/o/r/pull/1", changed: ["a.yml"] as string[] } as const;
  it("committed · no-changes · skipped/withheld는 사유를 합친 보류 수를 싣는다", () => {
    expect(planSyncFinish({ ...committed, withheld: { file: 1, key: 2 } })).toMatchObject({ status: "SUCCEEDED", withheld: 3, warnings: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } })).toMatchObject({ status: "SKIPPED", withheld: 1 });
    expect(planSyncFinish({ status: "skipped", reason: "withheld", withheld: { file: 0, key: 1 } })).toMatchObject({ status: "SKIPPED", withheld: 1, changed: 0 });
  });
  it("보류가 없거나 실패면 0이다 (짝)", () => {
    expect(planSyncFinish(committed)).toMatchObject({ withheld: 0 });
    expect(planSyncFinish({ status: "skipped", reason: "writer-warnings", warnings: ["x"] })).toMatchObject({ withheld: 0, warnings: 1 });
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
