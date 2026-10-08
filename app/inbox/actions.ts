"use server";

import type { PrismaClient } from "@/generated/prisma/client";
import { readSession } from "@/lib/auth/read-session";
import { describeFailure } from "@/lib/failure";
import { getPrisma } from "@/lib/db";
import { loadAttentionInbox } from "@/lib/inbox/load";
import { clampSeenAt, type InboxPlan } from "@/lib/inbox/plan";

export type AttentionBadgeResult = { status: "ok"; unread: number } | { status: "failed" };
export type OpenAttentionInboxResult = { status: "ok"; plan: InboxPlan; loadedAt: Date; marked: boolean } | { status: "failed" };
export type MarkAttentionSeenResult = { status: "ok"; marked: boolean } | { status: "invalid" } | { status: "failed" };

/**
 * 두 열람 경로(드롭다운 · `/inbox` 페이지)의 쓰기 한 벌 — 둘로 나뉘면 단조 조건이 갈린다.
 * ⚠️ export하지 않는다: `"use server"` 파일의 export는 전부 클라이언트가 부를 수 있는 Action이 된다.
 * 갱신 0행(이미 더 늦은 워터마크)도 읽음 성공이다. 실패는 목록을 막지 않고 `false`로만 알린다.
 */
async function markSeen(prisma: PrismaClient, userId: string, at: Date): Promise<boolean> {
  try {
    // 다른 탭의 더 늦은 열람을 뒤로 돌리지 않는다.
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ attentionSeenAt: null }, { attentionSeenAt: { lt: at } }] },
      data: { attentionSeenAt: at },
    });
    return true;
  } catch (error) {
    console.error("Attention watermark write failed.", { userId, cause: describeFailure(error) });
    return false;
  }
}

export async function loadAttentionBadgeAction(): Promise<AttentionBadgeResult> {
  const session = await readSession();
  if (session.status !== "ok") return { status: "failed" };
  try {
    const plan = await loadAttentionInbox(getPrisma(), session.userId);
    return { status: "ok", unread: plan.unread };
  } catch (error) {
    console.error("Attention badge load failed.", { userId: session.userId, cause: describeFailure(error) });
    return { status: "failed" };
  }
}

export async function openAttentionInboxAction(): Promise<OpenAttentionInboxResult> {
  const session = await readSession();
  if (session.status !== "ok") return { status: "failed" };
  // 조회 전 시각을 써야 그보다 늦은 시각의 항목을 보지도 않고 읽었다고 기록하지 않는다.
  const now = new Date();
  try {
    const prisma = getPrisma();
    const plan = await loadAttentionInbox(prisma, session.userId);
    const marked = await markSeen(prisma, session.userId, now);
    return { status: "ok", plan, loadedAt: now, marked };
  } catch (error) {
    console.error("Attention inbox load failed.", { userId: session.userId, cause: describeFailure(error) });
    return { status: "failed" };
  }
}

/**
 * `/inbox` 페이지가 마운트 뒤 부른다 — 목록은 서버 렌더가 이미 그렸으므로 다시 조회하지 않는다.
 * `at`은 페이지가 조회 **전**에 잡은 서버 시각이다. 클라이언트를 거쳐 오므로 서버 시각으로 잘라 미래를 막고,
 * 위조로 얻는 것은 자기 항목을 더 일찍 읽음 처리하는 것뿐이다(쓰는 대상은 세션 사용자 행 하나다).
 */
export async function markAttentionSeenAction(at: unknown): Promise<MarkAttentionSeenResult> {
  const session = await readSession();
  if (session.status !== "ok") return { status: "failed" };
  const seenAt = clampSeenAt(at, new Date());
  if (seenAt === null) return { status: "invalid" };
  return { status: "ok", marked: await markSeen(getPrisma(), session.userId, seenAt) };
}
