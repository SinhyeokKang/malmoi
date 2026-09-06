"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import { planMemberChange } from "@/lib/auth/membership";
import type { Role } from "@/lib/auth/permission";
import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";

/**
 * 멤버와 초대 (SAAS.md §5.6). **둘 다 OWNER 전용**이라 permission이 `member:manage`다.
 *
 * ⚠️ 화면은 6단계다 — 지금 호출자는 테스트와 번역 화면의 임시 초대 폼뿐이다. 그래도 판정을
 * 여기 두는 이유는 **`planMemberChange`에 호출부가 없으면 그 보호가 실재하지 않기 때문**이다
 * (이 리포의 반복 실패 유형 — POSTMORTEM 2026-09-03).
 */

/** 초대 유효 기간. 링크가 사람 손으로 전달되므로 하루는 짧고 한 달은 길다. */
const INVITE_DAYS = 7;

/**
 * ⚠️ **Server Action은 공개 엔드포인트다** — 타입 시그니처는 클라이언트를 구속하지 않는다 (`lib/keys/save.ts`의
 * `SaveInput`과 같은 이유). `role`은 DB enum에 그대로 들어가므로 조작된 값은 Prisma가 던져 digest 오류가 된다 —
 * 거부는 값으로 흘러야 한다 (ARCHITECTURE §6.3, code-review 2026-09-06 🟡13).
 */
const RoleSchema = z.enum(["OWNER", "EDITOR"]);
const InvitationInput = z.object({ slug: z.string().min(1), email: z.string().min(1), role: RoleSchema });
const MemberChangeInput = z.object({
  slug: z.string().min(1),
  targetUserId: z.string().min(1),
  nextRole: RoleSchema.nullable(),
});

export type InviteResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function createInvitation(raw: {
  slug: string;
  email: string;
  role: Role;
}): Promise<InviteResult> {
  // 입력 검증이 인가보다 먼저다 — slug가 없으면 무엇을 인가할지 정할 수 없다.
  const parsed = InvitationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId,
    slug: input.slug,
    permission: "member:manage",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // 저장·대조가 같은 정규화를 지나야 수락 시 대소문자로 갈리지 않는다.
  const email = normalizeEmail(input.email);
  if (email === "") return { ok: false, error: "invalid input" };

  // 이미 멤버인 사람에게 초대를 보내면 수락해도 바뀌는 것이 없다 — 거부해서 OWNER가
  // "보냈는데 왜 안 되지"를 겪지 않게 한다.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: existing.id } },
      select: { userId: true },
    });
    if (member !== null) return { ok: false, error: "already-member" };
  }

  // 원문은 여기서 한 번 돌려주고 **저장하지 않는다** (SAAS §5.6).
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  /**
   * ⚠️ **회전과 생성이 한 트랜잭션이고, 프로젝트 행을 먼저 잠근다** (Codex 감사 2026-09-06 #4). 갈라 두면
   * 두 OWNER가 같은 이메일을 동시에 초대할 때 각자 회전을 끝내고 각자 만들어 **유효 링크가 둘** 남는다 —
   * role이 다르면 둘 다 수락된다. `changeMember`와 같은 잠금이다. 잠금 없이 트랜잭션만 걸면 "기존 행이 없는
   * 동시 발급"은 막지 못한다 — 두 요청 모두 회전할 행이 없어 충돌이 안 난다.
   */
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

    // ⚠️ **미수락 행을 먼저 만료시킨다 = 토큰 회전.** `(projectId, email)`이 unique가 아니라
    // index인 이유가 이것이다 — 수락·만료된 행이 이메일을 점유하면 재초대가 막힌다 (design §5).
    await tx.projectInvitation.updateMany({
      where: { projectId, email, acceptedAt: null },
      data: { expiresAt: now },
    });

    await tx.projectInvitation.create({
      data: {
        projectId,
        email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        invitedBy: userId,
      },
    });
  });

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true, token };
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
 * 제거(`nextRole: null`)와 역할 변경이 **같은 판정을 지난다** — 강등을 따로 두면 "제거는 막고
 * 강등은 통과"가 되는데 결과는 같다(OWNER 없는 프로젝트).
 */
export async function changeMember(raw: {
  slug: string;
  targetUserId: string;
  nextRole: Role | null;
}): Promise<MemberChangeResult> {
  const parsed = MemberChangeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId,
    slug: input.slug,
    permission: "member:manage",
  });
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
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

    // 인가된 projectId로 좁힌다 — 안 좁히면 남의 프로젝트 멤버가 목록에 섞여 판정이 흔들린다.
    const members = await tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });

    const plan = planMemberChange({ members, targetUserId: input.targetUserId, nextRole: input.nextRole });
    if (plan !== "ok") return plan;

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

    const owners = await tx.projectMember.count({ where: { projectId, role: "OWNER" } });
    if (owners === 0) throw new LastOwnerRollback();
    return "ok" as const;
  }).catch((error: unknown) => {
    if (error instanceof LastOwnerRollback) return "last-owner" as const;
    throw error;
  });

  if (outcome !== "ok") return { ok: false, error: outcome };

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true };
}
