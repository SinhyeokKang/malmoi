"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";

/**
 * 머리 Alert — **[Dismiss]가 붙는 유일한 자리다** (account-settings 태스크 4).
 *
 * ⚠️ **가르는 축은 "다시 시도할 자리가 어디인가"다** (2026-09-14 정정). 전에는 *"머리는 일회성
 * 사유, 구역은 현재 상태"*라고 적었는데 `?connect=`가 그 규칙을 깬다 — 그것도 왕복에서 돌아온
 * 일회성 값인데 구역에 선다. 머리에 서는 둘은 **다시 누를 컨트롤이 이 화면에 없어서** 치울 수 있다.
 *
 * ⚠️ **`href`가 있으면 닫기가 그 주소로 `replace`한다.** 필요한 것은 `?link=` 하나다 —
 * `unlinkLoginMethod`의 `redirect`가 **같은 URL로 가는 소프트 내비게이션**이라, 지역 상태만 두면
 * 두 번째 실패에서 React가 같은 컴포넌트를 재사용하고 `shown=false`가 살아남아 **무음**이 된다
 * (POSTMORTEM 2026-09-06의 부류). 자기 쿼리만 뺀 주소로 옮기면 다음 실패가 실제 이동이 된다.
 *
 * ⚠️ **`?e=`에는 주지 않는다** — 그것은 연결 callback의 **하드 내비게이션**으로만 오므로 매번 새로
 * 마운트되고, 위 함정이 원리적으로 없다. 대칭을 위해 붙이면 **닫기가 서버 재렌더를 태우고**
 * `loadAccountView` → GitHub API가 한 번 더 돈다 — 하필 `?e=`는 그 API가 흔들리는 순간에 뜨는
 * 사유라, 알림을 닫은 것만으로 GitHub 구역이 `unavailable`로 바뀔 수 있다 (2026-09-14 2차 리뷰 R4).
 *
 * ⚠️ **닫힘 자체는 URL에 싣지 않는다** — 실어 보내면 새로고침·공유가 그 상태를 나르고, 그 함정을
 * 2026-09-13 모달 딥링크에서 밟았다. 지우는 것은 사유 쪽이다.
 */
export function DismissibleAlert({ href, children }: { href?: string; children: ReactNode }) {
  const router = useRouter();
  // 지역 상태가 먼저다 — `replace`가 도는 동안 화면이 안 바뀌면 사용자가 두 번 누른다.
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <Alert
      variant="danger"
      onDismiss={() => {
        setShown(false);
        if (href !== undefined) router.replace(href, { scroll: false });
      }}
    >
      {children}
    </Alert>
  );
}
