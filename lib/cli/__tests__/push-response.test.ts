import { describe, expect, it } from "vitest";

import { reportPushResponse } from "../push-response";

/**
 * **CLI가 `/api/push` 응답을 CI 로그로 옮기는 판정** (sync-edit-protection T16). 보류(`deferred`)는 200이라 exit 0이지만
 * "적재됐다"로 읽히면 안 된다 — Actions `::warning` 한 줄이 개발자가 보류를 아는 자리다(spec "개발자가 보류를 아는 자리").
 */
describe("reportPushResponse", () => {
  const deferred = JSON.stringify({ status: "deferred", reason: "pending-edits", pendingCount: 3, projectId: "p", commitSha: "abc" });
  const applied = JSON.stringify({ status: "applied", projectId: "p", commitSha: "abc", inserted: 1, updated: 0, orphaned: 0, unorphaned: 0, staleTranslations: 0, translationsFilled: 2, orphanedLocales: 0, refs: 0 });

  it("[C8] deferred → exit 0 + ::warning 정확히 1줄, '적재 안 됨'을 말한다", () => {
    const report = reportPushResponse(200, deferred);
    expect(report.exitCode).toBe(0);
    const warnings = report.lines.filter(line => line.startsWith("::warning"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("3 unsent translation changes");
    expect(warnings[0]).toMatch(/not imported/);
    // #129 — 보류된 편집은 Publish로 안 나간다(파일에 자리가 없다). "Publish하면 풀린다"만 말하면 그 상태의 CI가 영영 deferred다 —
    // 서버는 어느 편집이 보류인지 모르므로(렌더 시점 판정) 두 길을 다 말한다.
    expect(warnings[0]).toContain("Revert to last sent where available");
    expect(warnings[0]).toContain("discard");
    // 주된 해법은 파일·키를 되돌려 놓는 것이다 — Revert는 기준이 있는 셀만 열린다(#129 r5).
    expect(warnings[0]).toContain("add the file or key back to the repository");
    expect(warnings[0]).not.toContain("Send them with Publish, then");
  });

  it("[C8] applied → exit 0 + ::warning 0줄 (deferred 1줄 대조)", () => {
    const report = reportPushResponse(200, applied);
    expect(report.exitCode).toBe(0);
    expect(report.lines.filter(line => line.startsWith("::warning"))).toEqual([]);
  });

  it("[C8] 실제 오류(4xx/5xx) → exit 1, 보류 경고를 만들지 않는다", () => {
    for (const status of [400, 401, 409, 500]) {
      const report = reportPushResponse(status, JSON.stringify({ error: "stale commit" }));
      expect(report.exitCode).toBe(1);
      expect(report.lines.some(line => line.startsWith("::warning"))).toBe(false);
    }
  });

  it("본문은 800자까지 그대로 싣는다 — 기존 진단 출력 계약", () => {
    const long = JSON.stringify({ status: "applied", note: "x".repeat(2000) });
    const report = reportPushResponse(200, long);
    expect(report.lines).toContain(long.slice(0, 800));
  });

  it("JSON이 아니거나 모양이 다르면 보류로 읽지 않는다 — 200이면 exit 0", () => {
    for (const text of ["not json", "null", JSON.stringify({ status: "deferred" }), JSON.stringify({ status: "deferred", pendingCount: "3" })]) {
      const report = reportPushResponse(200, text);
      expect(report.exitCode).toBe(0);
      expect(report.lines.some(line => line.startsWith("::warning"))).toBe(false);
    }
  });

  it("::warning 줄은 서버 문자열을 싣지 않는다 — 워크플로 명령 주입(%0A·::) 여지를 만들지 않는다", () => {
    const hostile = JSON.stringify({ status: "deferred", reason: "pending-edits\n::error::x", pendingCount: 1, projectId: "p\n::set-output", commitSha: "abc" });
    const [warning] = reportPushResponse(200, hostile).lines.filter(line => line.startsWith("::warning"));
    expect(warning).not.toContain("set-output");
    expect(warning).not.toContain("::error");
  });
});
