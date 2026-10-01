import { describe, expect, it } from "vitest";

import { accessErrorMessage } from "@/lib/auth/message";
import { connectErrorMessage } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import { repositorySettingsErrorMessage } from "@/lib/settings/message";

import { TOOL_REJECTIONS, toToolResult, type ToolRejection } from "../result";

/**
 * 도구 결과 변환 (mcp-connector design §2.3). 거부는 `isError: true` + 기존 거부 코드 + **화면과 같은 문장**이다 — 에이전트가 사용자에게
 * 옮길 문장이 화면과 같아야 한다. 그래서 기대값을 리터럴이 아니라 **같은 사전 키**로 적는다(문구를 고쳐도 이 테스트는 안 깨지고,
 * 다른 키를 가리키면 깨진다). 장애는 거부가 아니다(ARCHITECTURE §6.00 ②) — `unavailable`만 `retryable`이다.
 */

const EXPECTED_MESSAGE: Record<ToolRejection, string> = {
  "not-found": m.errors.access["not-found"],
  forbidden: m.errors.access.forbidden,
  archived: m.errors.access.archived,
  unavailable: m.errors.access.unavailable,
  "repo-read-only": m.errors.connect["repo-read-only"],
  "sample-expired": m.errors.onboarding["sample-expired"],
  "manual-no-match": m.errors.onboarding["manual-no-match"],
  "not-ready": m.errors.onboarding["not-ready"],
  "token-scope": m.mcp.errors["token-scope"],
  reconfirm: m.mcp.errors.reconfirm,
  "invalid-input": m.mcp.errors["invalid-input"],
  "too-many": m.mcp.errors["too-many"](100),
  "duplicate-key": m.mcp.errors["duplicate-key"],
  // 적재 lease 중 번역 쓰기 거부(sync-lock C4) — Sync 결과 화면의 문장이다. 다시 열리는 시각은 `detail`이 든다.
  "sync-running": m.repositorySync.errors["already-running"],
};

describe("toToolResult — 성공", () => {
  it("structuredContent는 data 그대로, text는 요약, isError false", () => {
    expect(toToolResult({ status: "ok", data: { saved: 3 }, summary: "Saved 3 keys." })).toEqual({
      isError: false,
      content: [{ type: "text", text: "Saved 3 keys." }],
      structuredContent: { saved: 3 },
    });
  });
});

describe("toToolResult — 거부", () => {
  it("거부 코드 목록이 사전 대응표와 같다(빠진 갈래 없음)", () => {
    expect([...TOOL_REJECTIONS].sort()).toEqual(Object.keys(EXPECTED_MESSAGE).sort());
  });

  it.each(Object.entries(EXPECTED_MESSAGE))("%s → 화면과 같은 문장", (status, message) => {
    const result = toToolResult({ status: status as ToolRejection });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: message }]);
    expect(result.structuredContent).toMatchObject({ status, message });
  });

  it("unavailable·sync-running만 retryable: true를 싣는다", () => {
    for (const status of TOOL_REJECTIONS) {
      const result = toToolResult({ status });
      if (status === "unavailable" || status === "sync-running") expect(result.structuredContent.retryable, status).toBe(true);
      else expect("retryable" in result.structuredContent, status).toBe(false);
    }
  });

  it("예외 문구를 싣지 않는다 — 결과 모양에 예외 자리가 없다", () => {
    // 호출부가 실수로 cause를 붙여도(타입 밖) 결과에 새지 않는다.
    const leaky = { status: "unavailable", cause: new Error("connect ECONNREFUSED 10.0.0.1:5432"), message: "stack at db.ts:12" } as unknown as { status: "unavailable" };
    const result = toToolResult(leaky);
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(result)).not.toContain("db.ts");
    expect(result.content[0]?.text).toBe(m.errors.access.unavailable);
  });

  it("모르는 status는 unavailable 문장으로 접힌다 — 던지지 않는다", () => {
    const result = toToolResult({ status: "constructor" } as unknown as { status: "unavailable" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(m.errors.access.unavailable);
  });
});

describe("toToolResult — needs-browser", () => {
  it.each(["not-connected", "reauthorize", "no-installations", "no-candidates"] as const)("%s → isError · url · reason · 사전 문장", reason => {
    const url = "https://mal-moi.com/account";
    const result = toToolResult({ status: "needs-browser", reason, url });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ status: "needs-browser", reason, url, message: m.mcp.needsBrowser[reason] });
    expect(result.content[0]?.text).toContain(m.mcp.needsBrowser[reason]);
    expect(result.content[0]?.text).toContain(url);
    expect("retryable" in result.structuredContent).toBe(false);
  });
});

/**
 * **코어 거부 코드는 화면의 사전을 그대로 지난다** (design §2.3 — T6). 코어는 Action과 같은 union(`AccessError`·`OnboardError`·
 * `ConnectError`·`RepositorySettingsError`)으로 거부한다 — 도구가 그 코드를 새 문장으로 다시 쓰면 에이전트와 화면이 다른 말을 한다.
 */
describe("toToolResult — refused(코어 거부 코드)", () => {
  it.each([
    ["forbidden", accessErrorMessage("forbidden")],
    ["repo-not-installed", onboardErrorMessage("repo-not-installed")],
    ["limit-reached", onboardErrorMessage("limit-reached")],
    ["no-candidates", onboardErrorMessage("no-candidates")],
    ["invalid-branch", repositorySettingsErrorMessage("invalid-branch")],
    ["exchange-failed", connectErrorMessage("exchange-failed")],
  ])("%s → 화면 사전의 문장, status는 그 코드", (code, message) => {
    const result = toToolResult({ status: "refused", code });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ status: code, message });
    expect(result.content[0]?.text).toBe(message);
  });

  it("도구 전용 갈래(token-scope)도 같은 경로로 찾는다", () => {
    expect(toToolResult({ status: "refused", code: "token-scope" }).content[0]?.text).toBe(m.mcp.errors["token-scope"]);
  });

  /**
   * #149 — `token-scope`의 다음 행동은 **주체마다 다르다**. 개인 토큰은 불변이라 재발급이고, OAuth 연결은 앱에서 다시 연결(재동의 — mcp-oauth
   * design §4)해야 권한이 바뀐다. OAuth 앱에게 "토큰을 새로 발급하라"고 하면 다른 연결 방식(원문 복사)으로 보낸다.
   */
  it("token-scope 문장은 자격증명 종류로 갈린다 — OAuth는 다시 연결, 개인 토큰은 재발급", () => {
    for (const outcome of [{ status: "token-scope" } as const, { status: "refused", code: "token-scope" } as const]) {
      const oauth = toToolResult(outcome, "oauth");
      expect(oauth.content[0]?.text).toBe(m.mcp.errors["token-scope-oauth"]);
      expect(oauth.structuredContent).toMatchObject({ status: "token-scope", message: m.mcp.errors["token-scope-oauth"] });
      expect(toToolResult(outcome, "api-token").content[0]?.text).toBe(m.mcp.errors["token-scope"]);
      // 주체를 모르면(세션 경로 등) 지금 문장 그대로다.
      expect(toToolResult(outcome).content[0]?.text).toBe(m.mcp.errors["token-scope"]);
    }
    expect(m.mcp.errors["token-scope-oauth"]).not.toMatch(/new token|Issue/);
    // 다른 거부는 주체와 무관하다.
    expect(toToolResult({ status: "not-found" }, "oauth").content[0]?.text).toBe(m.errors.access["not-found"]);
  });

  it("unavailable은 refused로 와도 retryable이다", () => {
    expect(toToolResult({ status: "refused", code: "unavailable" }).structuredContent).toMatchObject({ status: "unavailable", retryable: true });
  });

  /**
   * **sync-running은 거부지만 기다리면 풀린다** (sync-lock C4) — `retryable: true`와 다시 열리는 시각(`detail`)을 함께 싣는다. 모르는 코드로
   * 접혀 `unavailable`이 되면 에이전트가 "장애"로 읽고 시각을 잃는다.
   */
  it("sync-running은 refused로 와도 retryable이고 detail의 시각을 싣는다 — unavailable로 접히지 않는다", () => {
    const detail = { startedAt: "2026-10-01T16:30:12.345Z", reopensBy: "2026-10-01T16:36:00.000Z" };
    const result = toToolResult({ status: "refused", code: "sync-running", detail });
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: m.repositorySync.errors["already-running"] }],
      structuredContent: { ...detail, status: "sync-running", message: m.repositorySync.errors["already-running"], retryable: true },
    });
    // 호출부가 화면 문장을 골라 넘겨도(Revert) 재시도 표시는 코드가 정한다.
    expect(toToolResult({ status: "refused", code: "sync-running", message: "x", detail }).structuredContent).toMatchObject({ status: "sync-running", retryable: true, ...detail });
  });

  it("어느 사전에도 없는 코드·프로토타입 이름은 unavailable로 접힌다 — 코드 원문을 싣지 않는다", () => {
    for (const code of ["constructor", "no-such-code"]) {
      const result = toToolResult({ status: "refused", code });
      expect(result.structuredContent).toMatchObject({ status: "unavailable", retryable: true });
      expect(JSON.stringify(result)).not.toContain(code);
    }
  });
});

it("refused의 message는 호출부가 고른 화면 문장이 이긴다", () => {
  expect(toToolResult({ status: "refused", code: "already-running", message: m.translations.publish.alreadyRunningBody }).structuredContent)
    .toEqual({ status: "already-running", message: m.translations.publish.alreadyRunningBody });
});
