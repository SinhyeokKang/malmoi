import "server-only";
import type { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Subject } from "@/lib/auth/subject";

import type { ToolOutcome } from "../result";
import type { ApiTokenSubject } from "../token-store";

/**
 * 도구 하나 = 이름(카탈로그의 정본과 같은 문자열) + 입력 스키마 + 실행. 입력 스키마는 **코어가 export한 zod를 재사용한다** —
 * 복제하면 한쪽만 좁아진다(design §3). 실행은 결과 union(`ToolOutcome`)만 돌려주고 MCP 모양은 `toToolResult`가 만든다.
 *
 * ⚠️ 입력에 `projectId`·`userId`가 없다 — 스키마가 그 필드를 모른다. 주체는 서버가 토큰에서 만든 `subject` 하나다.
 */
export type ToolContext = {
  prisma: PrismaClient; subject: ApiTokenSubject; now: Date;
  /** 요청이 들어온 앱 origin — 허용 호스트일 때만 있다(`requestOrigin`). 브라우저로 보내는 링크를 CLI가 열 수 있게 절대 URL로 만든다. */
  origin: string | null;
};

export type ToolDefinition<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  inputSchema: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<ToolOutcome>;
};

export function defineTool<S extends z.ZodObject>(definition: ToolDefinition<S>): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

/** 코어가 받는 주체 — 쓰기 잠금이 `credential`로 자격증명을 다시 읽는다. grants·scope는 입구 판정이 이미 썼다. */
export function coreSubject(subject: ApiTokenSubject): Subject {
  return { userId: subject.userId, credential: subject.credential };
}

/**
 * 앱 경로 → 에이전트에게 줄 링크. CLI는 상대 경로를 못 연다 — 허용 호스트에서 온 요청이면 그 origin을 붙인다. 모르면 경로 그대로다
 * (조작된 `Host`로 남의 호스트 링크를 만들지 않는다).
 */
export function appUrl(ctx: Pick<ToolContext, "origin">, path: string): string {
  return ctx.origin === null ? path : `${ctx.origin}${path}`;
}

export function ok(data: Record<string, unknown>, summary: string): ToolOutcome {
  return { status: "ok", data, summary };
}
