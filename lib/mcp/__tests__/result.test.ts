import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

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
  "not-implemented": m.mcp.errors["not-implemented"],
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

  it("unavailable만 retryable: true를 싣는다", () => {
    for (const status of TOOL_REJECTIONS) {
      const result = toToolResult({ status });
      if (status === "unavailable") expect(result.structuredContent.retryable).toBe(true);
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
