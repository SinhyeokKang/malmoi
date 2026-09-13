"use client";

import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";

/**
 * 머리 Alert — **[Dismiss]가 붙는 유일한 자리다** (account-settings 태스크 4).
 *
 * ⚠️ **구역 Alert에는 없다.** 머리 Alert는 왕복에서 돌아온 **일회성 사유**라 읽고 치울 수 있고,
 * 구역 Alert는 그 구역의 현재 상태를 말한다 — 치우면 상태가 사라진 것처럼 보인다.
 *
 * ⚠️ **주소창의 `?e=`·`?link=`를 지우지 않는다.** 닫힘을 URL에 실으면 새로고침·공유가 그 상태를
 * 나르게 되고, 같은 부류의 함정을 2026-09-13에 모달 딥링크에서 밟았다. 치운 사실은 이 화면의
 * 수명만큼만 산다.
 */
export function DismissibleAlert({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <Alert variant="danger" onDismiss={() => setShown(false)}>
      {children}
    </Alert>
  );
}
