import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { logCaught } from "@/lib/failure";

import { issueInvitations, type IssuedInvitation } from "./issue";
import type { IssuePlan, IssueRowError } from "./plan";
import { parseRecipients, type RecipientRowError } from "./recipients";
import { readInvitationEmailConfigFromEnv, sendInvitationEmails } from "./send";

/**
 * **다중 초대 메일의 공유 코어** (mcp-connector T4-b — invitation-email design §3·§4). 편집 UI의 `createInvitations`와 MCP
 * `invite_members`가 같은 인가·발급·발송을 지난다. **요청 전체가 통과하거나 전체가 막힌다.**
 *
 * 순서가 계약이다: 입력 → 인가 → 메일 설정(없으면 **쓰기 전에** 막는다) → 잠금 안 발급 → commit 뒤 발송 한 번.
 * ⚠️ **응답에 토큰·URL이 없다** — 원문은 서버 메모리와 메일에만 있다.
 * ⚠️ `issued`가 재검증 신호다 — 발송 결과와 무관하게 초대가 생겼으면 Pending에 보여야 Resend로 복구할 수 있다.
 */
export const InvitationsInput = z.object({
  slug: z.string().min(1),
  // 상한은 `parseRecipients`가 판정한다(too-many를 값으로 돌려준다). 여기 숫자는 파싱 비용의 방어선이다.
  // 빈 행은 클라이언트가 전송 전에 뺀다(design §3.2). 서버가 조용히 건너뛰면 행 오류 인덱스가 입력과 어긋난다 — 입력 오류다.
  recipients: z.array(z.object({ email: z.string().max(1000), role: z.string().max(20) })).min(1).max(200)
    .refine((rows) => rows.every((r) => r.email.trim() !== "")),
});

export type InvitationsResult =
  | { ok: true; count: number }
  | { ok: false; error: "invalid-rows"; rowErrors: (RecipientRowError | IssueRowError)[] }
  | { ok: false; error: "rate-limited"; retryAt: string; limit: "address"; index: number }
  | { ok: false; error: "rate-limited"; retryAt: string; limit: "project" | "user"; used: number }
  | { ok: false; error: "email-rejected" | "email-unknown"; retryAt: string }
  | { ok: false; error: string };

export async function inviteMembers(
  prisma: PrismaClient, subject: Subject, input: z.infer<typeof InvitationsInput>,
): Promise<{ result: InvitationsResult; issued: boolean }> {
  const { userId, tokenId } = subject;
  const refused = (result: InvitationsResult) => ({ result, issued: false });
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "member:manage" });
  if (access.status !== "ok") return refused({ ok: false, error: access.status });

  const recipients = parseRecipients(input.recipients);
  if (recipients.status === "invalid-rows") return refused({ ok: false, error: "invalid-rows", rowErrors: recipients.rowErrors });
  if (recipients.status !== "ok") return refused({ ok: false, error: recipients.status === "empty" ? "invalid input" : recipients.status });

  const config = readInvitationEmailConfigFromEnv();
  if (config.status !== "ready") return refused({ ok: false, error: "email-unavailable" });

  let issued: Awaited<ReturnType<typeof issueInvitations>>;
  try {
    issued = await issueInvitations(prisma, { projectId: access.projectId, userId, recipients: recipients.recipients, tokenId });
  } catch (error) {
    logCaught("invite", "issue", error);
    return refused({ ok: false, error: "unavailable" });
  }
  if (issued.status === "invalid-rows") return refused({ ok: false, error: "invalid-rows", rowErrors: issued.rowErrors });
  if (issued.status === "rate-limited") return refused(rateLimited(issued));
  if (issued.status !== "issued") return refused({ ok: false, error: issued.status });

  const outcome = await sendInvitationEmails(config, issued.project, toMessages(issued.invitations));
  if (outcome === "accepted") return { result: { ok: true, count: issued.invitations.length }, issued: true };
  return { result: { ok: false, error: outcome === "rejected" ? "email-rejected" : "email-unknown", retryAt: issued.retryAt.toISOString() }, issued: true };
}

function rateLimited(plan: Extract<IssuePlan, { status: "rate-limited" }>): InvitationsResult {
  const retryAt = plan.retryAt.toISOString();
  return plan.limit === "address"
    ? { ok: false, error: "rate-limited", retryAt, limit: "address", index: plan.index }
    : { ok: false, error: "rate-limited", retryAt, limit: plan.limit, used: plan.used };
}

/** 발송 메시지 — 재발송(`resendInvitation`)도 같은 모양이다. */
export function toMessages(invitations: readonly IssuedInvitation[]) {
  return invitations.map((i) => ({ to: i.email, token: i.token, role: i.role }));
}
