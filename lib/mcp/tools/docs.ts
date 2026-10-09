import "server-only";
import { z } from "zod";

import { loadSource, loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";

import { planDocsRead } from "../docs";
import { defineTool } from "./define";

/**
 * 가이드 읽기 — 공개 원고라 역할·grant가 없다(`toolCatalog` `req(null, null)`). MCP는 영어 고정 표면이라 `guide/en`만 읽는다.
 * ⚠️ `/api/mcp` 함수에 원고가 실리는 것은 `next.config.ts`의 `outputFileTracingIncludes`뿐이다 — `load.ts`가 `fs`로 읽어 트레이서가
 * 못 따라간다(ARCHITECTURE §8.1). `page`는 파일 경로로 쓰지 않는다 — `planDocsRead`가 SUMMARY 목록에서 찾는다.
 */
export const readDocs = defineTool({
  name: "read_docs",
  inputSchema: z.object({ page: z.string().max(200).optional(), query: z.string().min(1).max(200).optional() }),
  async run({ origin }, input) {
    const nav = loadSummary("en");
    const sources = new Map(flattenNav(nav).map(({ file }) => [file, loadSource("en", file)]));
    return planDocsRead(nav, sources, input, origin);
  },
});
