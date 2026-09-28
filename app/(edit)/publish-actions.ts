"use server";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadPreview } from "@/lib/publish/load-preview";
import type { PublishPreviewResult } from "@/lib/publish/preview";
import { logFailure } from "@/lib/github-connect/log";

/**
 * ⚠️ **거부와 읽기 실패를 한 갈래로 접지 않는다** (launch-readiness L3.3). 전에는 전부 `null`이라 세션 만료가
 * "미리보기 실패 / Retry"로 그려졌고, Retry는 같은 거부를 영영 다시 받는다. 거부는 실행 전 거부(`1h`)로 흐른다 —
 * 오류 값은 `triggerPullAction`의 실행 전 거부와 같은 낱말이다. 본체는 공유 코어 `loadPreview`다.
 */
export async function loadPublishPreview(raw: { slug: string }): Promise<PublishPreviewResult> {
  if (!raw || typeof raw.slug !== "string" || !raw.slug) return { status: "rejected", error: "invalid input" };
  const session = await readSession();
  if (session.status === "none") return { status: "rejected", error: "unauthorized" };
  // 세션 저장소 장애는 거부가 아니다 — 다시 시도하면 풀릴 수 있다.
  if (session.status !== "ok") return { status: "failed" };
  // DB 클라이언트 생성 실패(설정 누락)도 거부가 아니라 읽기 실패다 — 코어 밖이라 여기서 접는다.
  try {
    return await loadPreview(getPrisma(), { userId: session.userId }, { slug: raw.slug });
  } catch (error) {
    logFailure("publish-preview", error); return { status: "failed" };
  }
}
