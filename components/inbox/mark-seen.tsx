"use client";

import { useEffect } from "react";

import { markAttentionSeenAction } from "@/app/inbox/actions";
import { notifySeen } from "@/lib/inbox/unread-store";

/**
 * `/inbox` 페이지의 읽음 기록 섬 (inbox-page D1) — 화면에 아무것도 그리지 않는다.
 *
 * ⚠️ **렌더(GET)에서 쓰지 않고 마운트 뒤에 쓴다** — prefetch·캐시 설정 하나로 페이지 본체가 실행되면 보지 않은 목록이 읽음이 된다.
 * ⚠️ **`at`은 페이지가 조회 전에 잡은 서버 시각의 ISO 문자열이다** — Action이 `toISOString()` 왕복만 받아 `Date`는 조용히 `invalid`가 된다.
 * `marked: true`일 때만 탭 안 헤더·사이드바에 신호를 보낸다 — 실패·`marked: false`는 서버 워터마크가 안 움직였으니 배지가 남는다.
 * StrictMode의 이중 effect에서는 두 번 쓰지만 쓰기는 단조이고 헤더의 신호 처리도 멱등이라 막지 않는다.
 */
export function MarkSeen({ at }: { at: string }) {
  useEffect(() => {
    markAttentionSeenAction(at).then(result => {
      if (result.status === "ok" && result.marked) notifySeen();
    }, () => {});
  }, [at]);
  return null;
}
