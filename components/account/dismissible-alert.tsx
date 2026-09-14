"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";

/**
 * 머리 Alert — **[Dismiss]가 붙는 유일한 자리다** (account-settings 태스크 4).
 *
 * ⚠️ **구역 Alert에는 없다.** 머리 Alert는 왕복에서 돌아온 **일회성 사유**라 읽고 치울 수 있고,
 * 구역 Alert는 그 구역의 현재 상태를 말한다 — 치우면 상태가 사라진 것처럼 보인다.
 *
 * ⚠️ **닫기가 지역 상태 하나였을 때 같은 사유가 두 번 오면 무음이었다** (2026-09-14 리뷰).
 * `unlinkLoginMethod`의 `redirect`는 **같은 URL로 가는 소프트 내비게이션**이라, 두 번째 실패에서
 * React가 같은 자리의 컴포넌트를 재사용하고 `shown=false`가 살아남는다 — 사용자에게는 "버튼이 안
 * 눌린다"로 보인다(POSTMORTEM 2026-09-06이 세운 부류). 그래서 **자기 쿼리를 지운 주소로
 * `replace`** 한다: 다음 실패가 `/account` → `/account?link=…`라는 실제 이동이 되어 새로 마운트된다.
 *
 * ⚠️ **`href`를 서버가 만들어 내려준다.** 클라이언트가 `useSearchParams`로 다시 읽으면 같은 URL
 * 계약이 두 곳에 생기고, 그 훅은 프리렌더 경계까지 끌고 온다. **닫힘 자체는 URL에 싣지 않는다** —
 * 실어 보내면 새로고침·공유가 그 상태를 나르고, 그 함정을 2026-09-13 모달 딥링크에서 밟았다.
 */
export function DismissibleAlert({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  // 지역 상태도 함께 둔다 — `replace`가 도는 동안 화면이 안 바뀌면 두 번 누른다.
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <Alert
      variant="danger"
      onDismiss={() => {
        setShown(false);
        router.replace(href, { scroll: false });
      }}
    >
      {children}
    </Alert>
  );
}
