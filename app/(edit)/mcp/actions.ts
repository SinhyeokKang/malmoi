"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { logFailure } from "@/lib/github-connect/log";
import { planApiTokenIssue } from "@/lib/mcp/issue-plan";
import { generateApiToken, hashApiToken } from "@/lib/mcp/token";
import { revalidateAfterCommit } from "@/lib/revalidate-after-commit";
import { routes } from "@/lib/routes";

/**
 * MCP 개인 토큰 발급·폐기 (mcp-connector T5). **계정당 하나 · 불변**이라 [Create]와 [Rotate]가 같은 Action이다 — 기존 행 삭제 + 새 행
 * 삽입을 한 tx로. 폐기는 행 삭제다(자격증명이라 사건 보존 원칙 밖이다).
 *
 * `requireUser` 하나로 충분하다 — 행이 **사용자 소유**다. 모든 쿼리는 세션의 `userId`로만 좁힌다(POSTMORTEM 2026-09-06).
 * 캐시 무효화는 `/mcp` 레이아웃 하나다 — 토큰을 그리는 화면이 그것뿐이다(사이드바·셸은 토큰을 안 읽는다).
 * ⚠️ **토큰이 토큰을 만들지 않는다**(spec 비목표) — MCP 도구에 발급·폐기가 없고 여기가 유일한 길이다.
 */

/** 클라이언트가 보낸다 — 모양만 여기서 보고 값 판정은 `planApiTokenIssue`가 한다. */
const IssueInput = z.object({
  expiresInDays: z.number(),
  grants: z.array(z.string()).max(8),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("projects"), projectIds: z.array(z.string().min(1)).max(100) }),
  ]),
});

export type ApiTokenIssueResult =
  /** 원문은 여기 한 번뿐이다 — 서버는 해시만 저장한다. */
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; reason: "invalid-input" | "invalid-expiry" | "invalid-grants" | "invalid-scope" | "unavailable" };

export type ApiTokenRevokeResult = { ok: true } | { ok: false; reason: "unavailable" };

const INVALID_REASON = { expiresIn: "invalid-expiry", grants: "invalid-grants", scope: "invalid-scope" } as const;

export async function issueApiToken(raw: unknown): Promise<ApiTokenIssueResult> {
  const { userId } = await requireUser();
  const input = IssueInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid-input" };

  const prisma = getPrisma();
  let token: string;
  let expiresAt: Date;
  try {
    // 범위는 **현재 멤버십의 비보관 프로젝트**만 고를 수 있다. 발급 뒤 멤버에서 빠져도 판정이 멤버십을 먼저 보므로 남은 id는 효과가 없다.
    const members = await prisma.projectMember.findMany({ where: { userId, project: { archivedAt: null } }, select: { projectId: true } });
    const plan = planApiTokenIssue({ ...input.data, memberProjectIds: members.map(m => m.projectId), now: new Date() });
    if (plan.status === "invalid") return { ok: false, reason: INVALID_REASON[plan.field] };

    token = generateApiToken();
    expiresAt = plan.expiresAt;
    const data = { userId, tokenHash: hashApiToken(token), grants: plan.grants, allProjects: plan.allProjects, projectIds: plan.projectIds, expiresAt };
    // 삭제와 삽입이 한 tx다 — 사이에 실패하면 앞 토큰이 살아 있고, 둘 다 커밋되면 앞 토큰의 다음 호출부터 401이다.
    await prisma.$transaction(async tx => {
      await tx.apiToken.deleteMany({ where: { userId } });
      await tx.apiToken.create({ data });
    });
  } catch (error) {
    logFailure("mcp-token-issue", error);
    return { ok: false, reason: "unavailable" };
  }
  revalidateAfterCommit("mcp-token", routes.mcp());
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

export async function revokeApiToken(): Promise<ApiTokenRevokeResult> {
  const { userId } = await requireUser();
  try {
    // 멱등이다 — 이미 없으면 0행이고 결과는 같다(다른 탭이 먼저 폐기했어도 사용자가 원한 상태다).
    await getPrisma().apiToken.deleteMany({ where: { userId } });
  } catch (error) {
    logFailure("mcp-token-revoke", error);
    return { ok: false, reason: "unavailable" };
  }
  revalidateAfterCommit("mcp-token", routes.mcp());
  return { ok: true };
}
