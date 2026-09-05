"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { normalizeEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import { planMemberChange } from "@/lib/auth/membership";
import type { Role } from "@/lib/auth/permission";
import { getProjectAccess } from "@/lib/auth/query";
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

export type InviteResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function createInvitation(input: {
  slug: string;
  email: string;
  role: Role;
}): Promise<InviteResult> {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { ok: false, error: "unauthorized" };

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

  // ⚠️ **미수락 행을 먼저 만료시킨다 = 토큰 회전.** `(projectId, email)`이 unique가 아니라
  // index인 이유가 이것이다 — 수락·만료된 행이 이메일을 점유하면 재초대가 막힌다 (design §5).
  const now = new Date();
  await prisma.projectInvitation.updateMany({
    where: { projectId, email, acceptedAt: null },
    data: { expiresAt: now },
  });

  // 원문은 여기서 한 번 돌려주고 **저장하지 않는다** (SAAS §5.6).
  const token = randomBytes(32).toString("base64url");
  await prisma.projectInvitation.create({
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

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true, token };
}

export type MemberChangeResult = { ok: true } | { ok: false; error: string };

/**
 * 제거(`nextRole: null`)와 역할 변경이 **같은 판정을 지난다** — 강등을 따로 두면 "제거는 막고
 * 강등은 통과"가 되는데 결과는 같다(OWNER 없는 프로젝트).
 */
export async function changeMember(input: {
  slug: string;
  targetUserId: string;
  nextRole: Role | null;
}): Promise<MemberChangeResult> {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { ok: false, error: "unauthorized" };

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId,
    slug: input.slug,
    permission: "member:manage",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // 인가된 projectId로 좁힌다 — 안 좁히면 남의 프로젝트 멤버가 목록에 섞여 판정이 흔들린다.
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true, role: true },
  });

  const plan = planMemberChange({ members, targetUserId: input.targetUserId, nextRole: input.nextRole });
  if (plan !== "ok") return { ok: false, error: plan };

  // ⚠️ **조건부 쓰기의 count를 읽는다.** `delete`/`update`는 행이 사라졌을 때 P2025로 던지는데,
  // 그건 OWNER 둘이 같은 멤버를 동시에 건드리면 실제로 일어난다 — Server Action에서 처리되지 않은
  // throw는 사용자에게 digest만 있는 일반 오류가 되고, `planMemberChange`가 만들어 둔 사유가
  // 무시된다. `acceptInvitation`의 단일 사용과 같은 형태다.
  const where = { projectId, userId: input.targetUserId };
  const written =
    input.nextRole === null
      ? await prisma.projectMember.deleteMany({ where })
      : await prisma.projectMember.updateMany({ where, data: { role: input.nextRole } });

  // 판정과 쓰기 사이에 사라졌다 — 다른 요청이 먼저 처리한 것이고, 결과는 그쪽이 옳다.
  if (written.count === 0) return { ok: false, error: "not-member" };

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true };
}
