"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { m } from "@/lib/i18n";

/** 닫힘 상태는 이 브라우저·이 세션만의 것이다 — 서버에 저장하지 않는다. */
const DISMISS_KEY = "malmoi:edit-loss-dismissed";

/**
 * 편집 손실 창 배너 (design §3.11). **MVP §3.1이 감수한 대가를 편집자가 보는 자리에 처음으로 적는다** —
 * push가 strict로 덮으므로, 보낸 것이 머지되기 전에 코드가 푸시되면 그 편집이 사라진다.
 *
 * ⚠️ **닫기 키가 세션이 아니라 `lastPulledAt`이다.** 세션 단위로 닫으면 건수가 3→7로 늘어도 닫힌
 * 채여서 새 편집이 위험에 있는 것을 말하지 않는다. 다음 Publish 뒤 그 값이 바뀌어 배너가 다시 보인다.
 *
 * ⚠️ **클라이언트 마운트 뒤에만 렌더한다.** SSR은 `sessionStorage`를 모르므로, 먼저 그리면 닫아 둔
 * 사용자가 매 렌더에 한 프레임씩 배너를 본다.
 */
export function EditLossBanner({ count, dismissKey }: { count: number; dismissKey: string }) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === dismissKey);
    } catch {
      // 사생활 보호 모드 등에서 접근 자체가 던진다 — 보이는 쪽이 안전한 기본값이다.
    }
  }, [dismissKey]);

  if (!mounted || dismissed || count === 0) return null;

  return (
    <Alert
      variant="warning"
      onDismiss={() => {
        setDismissed(true);
        try {
          window.sessionStorage.setItem(DISMISS_KEY, dismissKey);
        } catch {
          // 저장 못 해도 이번 화면의 닫기는 동작한다.
        }
      }}
    >
      {m.translations.banner.unsent(count)}
    </Alert>
  );
}
