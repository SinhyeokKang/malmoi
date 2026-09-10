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
  /**
   * ⚠️ **의존성 배열이 없다 — 매 렌더 돈다.** 초대 수락은 실패 사유를 `?e=<사유>`로 넘기고 **같은
   * URL로 되돌아오므로**, 사용자가 토스트를 닫고 [Accept]를 다시 눌러 같은 사유로 실패하면 `error`가
   * 글자까지 같다. `[error]`로 묶으면 그 재시도가 **무음**이다 — 아무 일도 안 일어난 것으로 보인다.
   * 같은 id로 다시 부르는 것은 이미 떠 있는 토스트를 **갱신**할 뿐이라 깜빡이지 않는다.
   */
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
  });

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

  /**
   * ⚠️ **화면을 떠나면 거둔다.** `Toaster`는 루트에 있고 이 조각만 언마운트되므로, 정리가 없으면
   * 토스트가 **다음 화면까지 따라간다** — `/signin?error=…`에서 푸터의 Docs를 누르면 `/docs`에
   * 로그인 거부 사유가 떠 있었다(2026-09-11 실측). 로그인과 무관한 화면에 뜬 문구는 그 화면의
   * 상태로 읽힌다.
   *
   * ⚠️ **위 두 효과에 각각 붙이지 않는다** — `error` 효과는 매 렌더 도는데 거기에 정리를 달면
   * 렌더마다 거뒀다 다시 띄워 깜빡인다. 수명이 "이 화면에 있는 동안"이므로 정리도 한 번이다.
   */
  useEffect(
    () => () => {
      // ⚠️ **위에서 띄운 것과 같은 문자열이어야 한다** — 갈리면 정리가 조용히 아무것도 안 한다
      // (`toast.dismiss`는 없는 id에 대해서도 그냥 성공한다). `auth-toast.test.ts`가 둘을 맞댄다.
      toast.dismiss("auth-error");
      toast.dismiss("auth-sessions");
    },
    [],
  );

  return null;
}
