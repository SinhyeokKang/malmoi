import { beforeEach, expect, it, vi } from "vitest";

import { en } from "@/messages/en";

import type { ApiTokenSubject } from "../../token-store";

/**
 * #149 — 도구 실행이 **주체의 자격증명 종류를 결과 변환까지** 나른다. 판정(`planCreateAccess`)은 그대로이고 문장만 갈린다: OAuth 연결은
 * 앱에서 다시 연결, 개인 토큰은 재발급. `project:create` 없는 주체로 `detect_formats`를 불러 GitHub에 닿기 전의 거부를 본다.
 */
vi.mock("server-only", () => ({}));

const { executeTool } = await import("../execute");
const { TOOLS } = await import("..");
const detect = TOOLS.find((t) => t.name === "detect_formats")!;
const base = { userId: "u1", grants: [], scope: { kind: "all" } } as const;
const run = (credential: ApiTokenSubject["credential"]) =>
  executeTool(detect, () => ({ prisma: {} as never, subject: { ...base, credential } as ApiTokenSubject, now: new Date(), origin: null }), { owner: "o", repo: "r" });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

it("OAuth 연결의 권한 밖 호출은 다시 연결하라고 말한다", async () => {
  const result = await run({ kind: "oauth", connectionId: "c1" });
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe(en.mcp.errors["token-scope-oauth"]);
  expect(result.structuredContent).toMatchObject({ status: "token-scope" });
});

it("대조: 개인 토큰은 재발급 문장 그대로다", async () => {
  const result = await run({ kind: "api-token", tokenHash: "hash" });
  expect(result.content[0]?.text).toBe(en.mcp.errors["token-scope"]);
});
