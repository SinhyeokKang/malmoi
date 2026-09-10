"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { m } from "@/lib/i18n";

/**
 * 로그인 화면의 피드백 (8-1b). **인라인 `Alert`를 대체한다** — 규약 8이 8단계 전체를 토스트로
 * 통일했고, 한 화면에 경로가 둘이면 하나가 낡는다.
 *
 * ⚠️ **서버 컴포넌트는 토스트를 띄울 수 없다.** `?error=`·`?sessions=`는 서버 렌더 시점에 이미
 * 존재하는 **상태**인데 `toast()`는 클라이언트 호출이라, 이 조각이 그 사이를 잇는다.
 *
 * ⚠️ **아무것도 렌더하지 않는다** — 화면에 자리를 차지하면 그 자리가 곧 인라인 Alert의 자리가
 * 되어 규약 8이 흐려진다.
 *
 * ⚠️ **`?error=`를 URL에서 지우지 않는다.** `router.replace`로 지우면 새로고침으로 다시 볼 길이
 * 사라진다 — 남겨 두면 새로고침이 곧 "다시 보기"다.
 *
 * ⚠️ **문구는 서버가 만들어 넘긴다.** `signInErrorMessage`는 `@/lib/auth/message`에 있고 그
 * 모듈은 잎이 아니다 — 여기서 값으로 읽으면 클라이언트 그래프가 열린다
 * (`client-graph.test.ts` · POSTMORTEM 2026-09-07).
 */
export function AuthToast({ error, sessions }: { error?: string; sessions?: string }) {
  useEffect(() => {
    if (error === undefined || error === "") return;
    /**
     * ⚠️ **`duration: Infinity`다.** 거부 사유는 *조치가 필요한 정보*이고("이메일이 검증되지
     * 않았다"), 4초 뒤 사라지면 **화면에 설명이 0이 된다** — 인라인 Alert를 걷어낸 대가를
     * 여기서 갚는다.
     *
     * ⚠️ **`id`를 고정한다** — StrictMode에서 effect가 두 번 돌아 같은 토스트가 둘이 뜬다.
     * 같은 id는 쌓이지 않고 갱신된다.
     */
    toast.error(error, { id: "auth-error", duration: Infinity, closeButton: true });
  }, [error]);

  useEffect(() => {
    if (sessions !== "revoked") return;
    /**
     * ⚠️ **기본 duration(4초)이 아니다.** 되돌릴 수 없는 보안 조치(전 기기 로그아웃)의 **유일한
     * 완료 증거**이고, 사용자는 방금 로그아웃돼 이 화면에 도착한 참이다.
     */
    toast.success(m.account.sessions.complete, {
      id: "auth-sessions",
      duration: 30_000,
      closeButton: true,
    });
  }, [sessions]);

  return null;
}
