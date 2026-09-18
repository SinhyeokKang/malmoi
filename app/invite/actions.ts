"use server";

import { decodeUser, decodeInvitation } from "@/lib/credentials/records";
import { logCaught } from "@/lib/failure";

import { hashInviteToken, planInvitationAccept } from "@/lib/auth/invitation";
import type { InviteError } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";

/**
 * 초대 수락.
 *
 * ⚠️ **이 Action은 `getProjectAccess`를 지나지 않는다 — ARCHITECTURE §6.1의 명시된 예외다.**
 * 수락 전에는 멤버가 아니므로 지날 수가 없다. 대신 **토큰이 인가를 대신한다**: 해시로 행을 찾고,
 * 단일 사용이고, provider가 검증한 이메일과 대조한다 (ARCHITECTURE §6.02). `requireUser` 자리에 해당하는
 * 세션 확인은 그대로 한다 — 링크만으로는 들어올 수 없다.
 *
 * ⚠️ 이 파일이 `(edit)` 그룹 **밖**에 있는 이유: 그 레이아웃이 세션을 요구하고 미들웨어가
 * 세션 없는 요청을 로그인 화면(`/signin`)으로 돌리는데, 그러면 초대 링크의 토큰이 사라진다 (ARCHITECTURE §6.1).
 */

/**
 * ⚠️ **`error`가 `string`이 아니라 union이다.** 화면이 `inviteErrorMessage`로 문구를 고르는데,
 * `string`이면 사유를 늘려도 그 switch가 조용히 기본값으로 떨어진다.
 */
export type AcceptResult = { ok: true; slug: string } | { ok: false; error: InviteError };

export async function acceptInvitation(input: { token: string }): Promise<AcceptResult> {
  // 타입은 클라이언트를 구속하지 않는다 — 문자열이 아니면 해시 함수에 닿기 전에 "그런 초대 없음"이다.
  if (typeof input?.token !== "string" || input.token === "") return { ok: false, error: "not-found" };

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  try {
    const prisma = getPrisma();

    // `User.email`은 로그인 시점에 provider가 검증한 값이다 (ARCHITECTURE §6.2) — 그래서 여기서
    // 다시 provider를 부를 필요가 없다.
    const storedUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailLookup: true } });
    const user = storedUser === null ? null : decodeUser(storedUser);
    if (user === null) return { ok: false, error: "unauthorized" };

    const storedInvitation = await prisma.projectInvitation.findUnique({
      where: { tokenHash: hashInviteToken(input.token) },
      select: { id: true, projectId: true, email: true, emailLookup: true, role: true, expiresAt: true, acceptedAt: true },
    });

    const invitation = storedInvitation === null ? null : decodeInvitation(storedInvitation);
    const now = new Date();
    const plan = planInvitationAccept({
      invitation,
      verifiedEmail: user.email,
      now,
    });
    if (plan !== "ok") return { ok: false, error: plan };
    // `plan === "ok"`는 행이 있었다는 뜻이다 — `not-found`가 그 앞에서 걸린다.
    if (invitation === null) return { ok: false, error: "not-found" };

    const project = await prisma.project.findUnique({
      where: { id: invitation.projectId },
      select: { slug: true },
    });
    if (project === null) return { ok: false, error: "not-found" };

    // ⚠️ **이미 멤버인지 먼저 본다.** `createInvitation`이 그 조합을 막지만 **막혀 있다는 것이 코드가
    // 아니라 추론에 있으면** 다음 변경에서 열린다 — 그때 `projectMember.create`가 unique 위반으로
    // 던지고, 초대 링크를 연 외부인에게는 digest만 남는다.
    const already = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invitation.projectId, userId } },
      select: { userId: true },
    });
    if (already !== null) return { ok: false, error: "already-member" };

    const accepted = await prisma.$transaction(async (tx) => {
      // ⚠️ **단일 사용을 조건부 갱신으로 강제한다.** 두 요청이 동시에 들어와도 `acceptedAt: null`이
      // 한쪽만 통과시킨다 — count를 안 읽고 그냥 update하면 둘 다 성공해 멤버십이 두 번 생긴다.
      // ⚠️ **만료도 소비 조건에 넣는다.** 위 판정은 조회 시점의 행을 봤다 — 그 뒤 OWNER가 재초대로 이 행을
      // 만료시켰으면(`createInvitation`의 회전) 옛 role로 멤버가 되면 안 된다 (Codex 감사 2026-09-06 #3).
      const claimed = await tx.projectInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { equals: invitation.expiresAt, gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) return false;

      await tx.projectMember.create({
        data: { projectId: invitation.projectId, userId, role: invitation.role },
      });
      return true;
    });

    if (!accepted) {
      // 경합에서 진 쪽 — 왜 졌는지는 행을 다시 봐야 안다. 수락됨이 만료보다 앞이다 (`planInvitationAccept`와 같은 순서).
      const after = await prisma.projectInvitation.findUnique({
        where: { id: invitation.id },
        select: { acceptedAt: true },
      });
      return { ok: false, error: after?.acceptedAt != null ? "already-accepted" : "expired" };
    }
    return { ok: true, slug: project.slug };
  } catch (error) {
    logCaught("invite", "accept", error);
    return { ok: false, error: "unavailable" };
  }
}
