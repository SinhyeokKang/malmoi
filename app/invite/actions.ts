"use server";

import { auth } from "@/auth";
import { hashInviteToken, planInvitationAccept } from "@/lib/auth/invitation";
import { getPrisma } from "@/lib/db";

/**
 * 초대 수락.
 *
 * ⚠️ **이 Action은 `getProjectAccess`를 지나지 않는다 — spec 완료 조건 6의 명시된 예외다.**
 * 수락 전에는 멤버가 아니므로 지날 수가 없다. 대신 **토큰이 인가를 대신한다**: 해시로 행을 찾고,
 * 단일 사용이고, provider가 검증한 이메일과 대조한다 (SAAS §5.6). `requireUser` 자리에 해당하는
 * 세션 확인은 그대로 한다 — 링크만으로는 들어올 수 없다.
 *
 * ⚠️ 이 파일이 `(edit)` 그룹 **밖**에 있는 이유: 그 레이아웃이 세션을 요구하고 미들웨어가
 * 세션 없는 요청을 `/`로 돌리는데, 그러면 초대 링크의 토큰이 사라진다 (design §4.1).
 */

export type AcceptResult = { ok: true; slug: string } | { ok: false; error: string };

export async function acceptInvitation(input: { token: string }): Promise<AcceptResult> {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { ok: false, error: "unauthorized" };

  const prisma = getPrisma();

  // `User.email`은 로그인 시점에 provider가 검증한 값이다 (ARCHITECTURE §6.2) — 그래서 여기서
  // 다시 provider를 부를 필요가 없다.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user === null) return { ok: false, error: "unauthorized" };

  const invitation = await prisma.projectInvitation.findUnique({
    where: { tokenHash: hashInviteToken(input.token) },
    select: { id: true, projectId: true, email: true, role: true, expiresAt: true, acceptedAt: true },
  });

  const plan = planInvitationAccept({
    invitation,
    verifiedEmail: user.email,
    now: new Date(),
  });
  if (plan !== "ok") return { ok: false, error: plan };
  // `plan === "ok"`는 행이 있었다는 뜻이다 — `not-found`가 그 앞에서 걸린다.
  if (invitation === null) return { ok: false, error: "not-found" };

  const project = await prisma.project.findUnique({
    where: { id: invitation.projectId },
    select: { slug: true },
  });
  if (project === null) return { ok: false, error: "not-found" };

  const accepted = await prisma.$transaction(async (tx) => {
    // ⚠️ **단일 사용을 조건부 갱신으로 강제한다.** 두 요청이 동시에 들어와도 `acceptedAt: null`이
    // 한쪽만 통과시킨다 — count를 안 읽고 그냥 update하면 둘 다 성공해 멤버십이 두 번 생긴다.
    const claimed = await tx.projectInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    await tx.projectMember.create({
      data: { projectId: invitation.projectId, userId, role: invitation.role },
    });
    return true;
  });

  // 경합에서 진 쪽은 이미 수락된 것을 본다 — "성공"으로 접지 않는다.
  if (!accepted) return { ok: false, error: "already-accepted" };
  return { ok: true, slug: project.slug };
}
