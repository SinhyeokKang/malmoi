import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { recordEvent } from "@/lib/events/record";
import { invitationEventLabel, userEventLabel } from "@/lib/events/member-label";

import { lockProjectAccess } from "./lock";
import { planMemberChange } from "./membership";
import { getProjectAccess } from "./query";
import type { Subject } from "./subject";

/**
 * **멤버·초대 변경의 공유 코어** (mcp-connector T4-b — ARCHITECTURE §6.02). 편집 UI와 MCP `revoke_invitation`·`change_member`가 같은
 * 인가(`member:manage`, OWNER 전용)·잠금 tx·사건을 지난다. 재검증은 호출자의 몫이다.
 */

/**
 * ⚠️ **Server Action은 공개 엔드포인트다** — `role`은 DB enum에 그대로 들어가므로 조작된 값은 Prisma가 던져 digest 오류가 된다 —
 * 거부는 값으로 흘러야 한다 (ARCHITECTURE §6.3, code-review 2026-09-06 🟡13).
 */
const RoleSchema = z.enum(["OWNER", "EDITOR"]);
export const MemberChangeInput = z.object({
  slug: z.string().min(1),
  targetUserId: z.string().min(1),
  nextRole: RoleSchema.nullable(),
});
export const RevokeInput = z.object({ slug: z.string().min(1), invitationId: z.string().min(1) });

export type RevokeResult = { ok: true } | { ok: false; error: string };

/**
 * 대기 중인 초대를 무효화한다.
 *
 * ⚠️ **행을 지우지 않는다.** 지우면 그 링크의 재사용 시도가 `already-accepted`가 아니라 `not-found`가 되어 만료·오배송과 뭉개진다.
 * 무효화의 관용구는 **만료 시각을 당기는 것**이다.
 * ⚠️ **`where`에 `projectId`와 `acceptedAt: null`이 함께 있다.** 앞은 테넌트 경계, 뒤는 "이미 멤버가 된 사람의 초대를 되돌린 것처럼
 * 보이지 않게"다. 둘 중 하나만 있어도 `count`가 0이 되어 `not-found`로 나간다.
 */
export async function revokePendingInvitation(prisma: PrismaClient, subject: Subject, input: z.infer<typeof RevokeInput>): Promise<RevokeResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "member:manage" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  // 조건부 쓰기의 count를 읽는다 — `update`는 행이 없을 때 P2025로 던지고, Server Action의
  // 처리되지 않은 throw는 사용자에게 digest만 있는 오류가 된다 (`changeMember`와 같은 형).
  // ⚠️ **사건이 같은 트랜잭션이다** — 0행이면 아무것도 안 쓰고, 사건 기록이 실패하면 무효화도 롤백된다.
  const written = await prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: access.projectId, userId: userId, permission: "member:manage", credential });
    if (locked.status !== "ok") return locked;
    const invitation = await tx.projectInvitation.findFirst({ where: { id: input.invitationId, projectId: access.projectId } });
    if (invitation === null || invitation.acceptedAt !== null) return 0;
    // 이미 만료된 초대는 무효화할 상태가 없다 — 성공 응답은 유지하되 사건을 만들지 않는다.
    if (invitation.expiresAt <= new Date()) return 1;
    // 라벨을 **쓰기 전에** 읽는다 — 무효화는 행을 지우지 않지만 순서를 뒤집을 이유도 없다.
    const targetLabel = await invitationEventLabel(tx, { projectId: access.projectId, invitationId: input.invitationId });
    const count = (await tx.projectInvitation.updateMany({
      where: { id: input.invitationId, projectId: access.projectId, acceptedAt: null },
      data: { expiresAt: new Date() },
    })).count;
    if (count === 0) return 0;
    await recordEvent(tx, {
      projectId: access.projectId,
      subtype: "member.invitationRevoked",
      actor: { kind: "USER", userId: userId },
      scope: "project-wide",
      payload: { kind: "MEMBER", targetLabel, role: null },
    });
    return count;
  });
  if (typeof written !== "number") return { ok: false, error: written.status };
  if (written === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

export type MemberChangeResult = { ok: true } | { ok: false; error: string };

/** 트랜잭션 안에서 던져 쓰기를 되돌리는 신호. 밖에서 잡아 `last-owner`로 바꾼다 — 사용자에게 예외를 보내지 않는다. */
class LastOwnerRollback extends Error {
  constructor() {
    super("last owner would be removed");
    this.name = "LastOwnerRollback";
  }
}

/**
 * 제거(`nextRole: null`)와 역할 변경이 **같은 판정을 지난다** — 강등을 따로 두면 "제거는 막고 강등은 통과"가 되는데 결과는 같다
 * (OWNER 없는 프로젝트).
 */
export async function changeMemberRole(prisma: PrismaClient, subject: Subject, input: z.infer<typeof MemberChangeInput>): Promise<MemberChangeResult> {
  const { userId, credential } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "member:manage" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  /**
   * ⚠️ **판정·쓰기·재집계가 한 트랜잭션이고, 프로젝트 행을 먼저 잠근다.** OWNER 둘이 **동시에 각자를**
   * 제거·강등하면 둘 다 OWNER 2명인 목록을 읽어 통과하고 서로 다른 행을 쓰므로 count도 각각 1이다 —
   * 결과는 OWNER 0명이고 아무도 되살릴 수 없다 (Codex 감사 2026-09-06 #2). FK Restrict는 멤버 행 **변경**을
   * 막지 않는다. `SELECT … FOR UPDATE`가 같은 프로젝트의 멤버 변경을 직렬화하고, 쓰기 뒤 OWNER를 다시 세는
   * 것은 잠금이 새는 경우(다른 경로의 쓰기)의 그물이다 — 0이면 던져 롤백한다.
   */
  const outcome = await prisma.$transaction(async (tx) => {
    // 잠금 대기 중 호출자가 제거·강등됐으면 여기서 멈춘다 — OWNER 재집계는 "남은 OWNER가 있나"만 보고 "누가 지우나"를 안 본다.
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "member:manage", credential });
    if (locked.status !== "ok") return locked.status;

    // 인가된 projectId로 좁힌다 — 안 좁히면 남의 프로젝트 멤버가 목록에 섞여 판정이 흔들린다.
    const members = await tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });

    const plan = planMemberChange({ members, targetUserId: input.targetUserId, nextRole: input.nextRole });
    if (plan !== "ok") return plan;
    if (members.find(member => member.userId === input.targetUserId)?.role === input.nextRole) return "ok" as const;

    // ⚠️ **조건부 쓰기의 count를 읽는다.** `delete`/`update`는 행이 사라졌을 때 P2025로 던지는데,
    // 그건 다른 경로가 같은 멤버를 먼저 지운 경우 실제로 일어난다 — Server Action에서 처리되지 않은
    // throw는 사용자에게 digest만 있는 일반 오류가 되고, `planMemberChange`가 만들어 둔 사유가
    // 무시된다. `acceptInvitation`의 단일 사용과 같은 형태다.
    const where = { projectId, userId: input.targetUserId };
    const written =
      input.nextRole === null
        ? await tx.projectMember.deleteMany({ where })
        : await tx.projectMember.updateMany({ where, data: { role: input.nextRole } });

    // 판정과 쓰기 사이에 사라졌다 — 다른 요청이 먼저 처리한 것이고, 결과는 그쪽이 옳다.
    if (written.count === 0) return "not-member" as const;

    // 제거와 역할 변경이 **같은 사건 계열**이다 — `after`가 null이면 제거다(판정이 하나인 것과 같은 축).
    await recordEvent(tx, {
      projectId,
      subtype: input.nextRole === null ? "member.removed" : "member.roleChanged",
      actor: { kind: "USER", userId },
      scope: "project-wide",
      payload: {
        kind: "MEMBER",
        targetLabel: await userEventLabel(tx, input.targetUserId),
        role: { before: members.find((member) => member.userId === input.targetUserId)?.role ?? null, after: input.nextRole },
      },
    });

    const owners = await tx.projectMember.count({ where: { projectId, role: "OWNER" } });
    if (owners === 0) throw new LastOwnerRollback();
    return "ok" as const;
  }).catch((error: unknown) => {
    if (error instanceof LastOwnerRollback) return "last-owner" as const;
    throw error;
  });

  if (outcome !== "ok") return { ok: false, error: outcome };
  return { ok: true };
}
