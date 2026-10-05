"use server";

import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadAttentionInbox } from "@/lib/inbox/load";
import type { InboxPlan } from "@/lib/inbox/plan";

export type AttentionBadgeResult = { status: "ok"; unread: number } | { status: "failed" };
export type OpenAttentionInboxResult = { status: "ok"; plan: InboxPlan; loadedAt: Date; marked: boolean } | { status: "failed" };

export async function loadAttentionBadgeAction(): Promise<AttentionBadgeResult> {
  const session = await readSession();
  if (session.status !== "ok") return { status: "failed" };
  try {
    const plan = await loadAttentionInbox(getPrisma(), session.userId);
    return { status: "ok", unread: plan.unread };
  } catch {
    return { status: "failed" };
  }
}

export async function openAttentionInboxAction(): Promise<OpenAttentionInboxResult> {
  const session = await readSession();
  if (session.status !== "ok") return { status: "failed" };
  // 조회 도중 생긴 일을 보지도 않고 읽었다고 기록하지 않는다.
  const now = new Date();
  try {
    const prisma = getPrisma();
    const plan = await loadAttentionInbox(prisma, session.userId);
    let marked = true;
    try {
      // 다른 탭의 더 늦은 열람을 뒤로 돌리지 않는다.
      await prisma.user.updateMany({
        where: { id: session.userId, OR: [{ attentionSeenAt: null }, { attentionSeenAt: { lt: now } }] },
        data: { attentionSeenAt: now },
      });
    } catch {
      marked = false;
    }
    return { status: "ok", plan, loadedAt: now, marked };
  } catch {
    return { status: "failed" };
  }
}
