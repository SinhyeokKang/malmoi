import "server-only";
import { revalidatePath } from "next/cache";

import { changeMemberRole, MemberChangeInput, revokePendingInvitation, RevokeInput } from "@/lib/auth/members";
import { en } from "@/messages/en";
import { InvitationsInput, inviteMembers, type InvitationsResult } from "@/lib/invitation-email/create";
import { settleRevalidate } from "@/lib/revalidate-after-commit";

import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";

import type { ToolOutcome } from "../result";
import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **멤버 쓰기 셋** (design §2.2) — OWNER 전용(`member:manage`). 코어·재검증이 Server Action과 같다. 초대는 **메일을 보낸다** — 응답에 토큰·URL이
 * 없다(원문은 서버 메모리와 메일에만 있다). 마지막 OWNER 보호·자기 변경·한도 판정은 코어가 그대로 든다.
 */
export const inviteMembersTool = defineTool({
  name: "invite_members",
  inputSchema: InvitationsInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "invite_members", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const { result, issued } = await inviteMembers(prisma, coreSubject(subject), input);
    // 발송 결과와 무관하게 초대가 생겼으면 다시 그린다 — Pending에 보여야 Resend로 복구할 수 있다.
    if (issued) settleRevalidate("invite", () => revalidatePath(`/projects/${input.slug}/members`));
    if (result.ok) return ok({ invited: result.count }, en.mcp.summary.invited(result.count));
    return inviteRefusal(result);
  },
});

export const revokeInvitation = defineTool({
  name: "revoke_invitation",
  inputSchema: RevokeInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "revoke_invitation", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await revokePendingInvitation(prisma, coreSubject(subject), input);
    if (!result.ok) return { status: "refused", code: result.error };
    settleRevalidate("revoke-invitation", () => revalidatePath(`/projects/${input.slug}/members`));
    return ok({ revoked: input.invitationId }, en.mcp.summary.revoked);
  },
});

export const changeMember = defineTool({
  name: "change_member",
  inputSchema: MemberChangeInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "change_member", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await changeMemberRole(prisma, coreSubject(subject), input);
    if (!result.ok) return { status: "refused", code: result.error };
    settleRevalidate("member-change", () => revalidatePath(`/projects/${input.slug}/members`));
    return ok({ userId: input.targetUserId, role: input.nextRole }, input.nextRole === null ? en.mcp.summary.memberRemoved : en.mcp.summary.memberChanged(input.nextRole));
  },
});

/**
 * 초대 거부 → 멤버 화면의 폼 Alert와 **같은 문장**(`components/members/invite-modal.tsx`의 `formAlertFor`). 행 오류·한도는 사람이 고칠 자리를
 * 가리키는 값(`rowErrors`·`retryAt`·`limit`)을 함께 싣는다. ⚠️ 초대가 생긴 뒤 메일이 못 나간 갈래(`email-*`)는 Pending의 Resend가 복구다.
 */
function inviteRefusal(result: Exclude<InvitationsResult, { ok: true }>): ToolOutcome {
  const invite = en.members.invite;
  const { ok: _ok, error, ...detail } = result;
  const message =
    error === "email-unknown" ? invite.unconfirmed.body
    : error === "email-rejected" ? invite.sendFailed
    : error === "email-unavailable" ? invite.emailUnavailable
    : error === "too-many" ? invite.tooMany(INVITATION_HOURLY_LIMIT)
    : error === "member-limit" ? en.members.seatsFull(MEMBER_LIMIT)
    : error === "rate-limited" ? invite.limit.title
    : error === "invalid-rows" ? invite.failed
    : undefined;
  return { status: "refused", code: error, ...(message === undefined ? {} : { message }), detail };
}
