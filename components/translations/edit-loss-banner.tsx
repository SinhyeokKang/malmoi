"use client";

import { ArrowUp } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

/**
 * 리포 갱신 보류 배너 (sync-edit-protection T13 · design §4.3). 미전달 편집이 있으면 CI 자동 적재가 통째로 보류되므로
 * **손실이 아니라 멈춤**을 말한다. 파일 이름은 옛 "편집 손실 창" 배너의 자리를 그대로 이은 것이다.
 *
 * ⚠️ **2026-09-18에 뒤집었다** — 전에는 `…can be lost when repository changes are imported automatically or with Sync.`를
 * `lastPulledAt` 닫기 키의 warning으로 띄웠다. 보호가 켜지면 그 문장의 절반이 거짓이고, 남은 절반은 안전한 상태에 amber를
 * 띄운다(DESIGN §6.1 "가장 흔한 상태가 가장 조용하다").
 * ⚠️ **닫기가 없다** — 상시 조건이고 출구(Publish)가 헤더에 있다. 닫기 키를 편집 시각으로 두면 저장마다 키가 바뀌어
 * 닫기가 스스로를 무효화한다(DESIGN §6.67과 같은 형). 숨길 지역 상태가 없으니 SSR 플래시 방지용 마운트 대기도 없다.
 * ⚠️ **액션은 둘째 Publish 트리거가 아니다** — Publish 모달의 트리거는 헤더 버튼 하나이고 `returnFocusRef`·`publishPending`
 * 잠금이 그 자리에 묶여 있다. 여기서는 그 버튼으로 포커스만 옮긴다.
 */
export function EditLossBanner({ count, publishButtonId }: { count: number; publishButtonId: string }) {
  if (count === 0) return null;
  return (
    <Alert
      variant="info"
      actions={
        <Button onClick={() => document.getElementById(publishButtonId)?.focus()}>
          {m.translations.banner.sendWithPublish}
          <ArrowUp className="size-3.5" aria-hidden />
        </Button>
      }
    >
      {m.translations.banner.paused(count)}
    </Alert>
  );
}
