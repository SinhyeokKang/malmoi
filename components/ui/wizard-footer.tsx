"use client";

import { useMessages } from "@/components/i18n/messages-provider";
import { ArrowRight } from "lucide-react";
import { Button } from "./button";

/**
 * 온보딩 버튼군만 소유한다. 문장·바닥 배치는 LargeModal이 유지한다.
 *
 * ⚠️ **꺼짐 갈래가 둘이다.** `nextBlocked`를 안 주면 신규 프로젝트의 기존 갈래(꺼짐 = 진짜 `disabled`, 진행 중 = `loading`)이고,
 * 주면 `aria-disabled` 갈래다(Add sources — sources-add-remove fix1): 꺼져도 포커스를 받아 `nextDescribedBy`의 사유가 닿고, 진행 중은
 * `busy`라 포커스가 버튼에 머문다(DESIGN §6.65 — 한 버튼에 `loading`과 `aria-disabled`를 겸하지 않는다).
 */
export function WizardFooter({
  showBack = false, onBack, backDisabled, nextLabel, nextArrow = true, nextDisabled = false, nextBlocked, nextDescribedBy, busy = false, spinnerSize, onNext,
  ...data
}: {
  showBack?: boolean;
  onBack?: () => void;
  /** [Back]의 잠금 — 기본은 `busy`. 다른 동작이 도는 동안에도 막아야 하는 호출부가 넘긴다. */
  backDisabled?: boolean;
  nextLabel?: string;
  nextArrow?: boolean;
  nextDisabled?: boolean;
  /** 있으면 `aria-disabled` 갈래다. `nextDisabled`와 같이 쓰지 않는다. */
  nextBlocked?: boolean;
  nextDescribedBy?: string;
  busy?: boolean;
  spinnerSize?: "sm" | "md";
  onNext: () => void;
} & { [attribute: `data-${string}`]: string | boolean | undefined }) {
  const m = useMessages();
  const aria = nextBlocked !== undefined;
  return <>
    {showBack && <Button type="button" size="lg" onClick={onBack} disabled={backDisabled ?? busy}>{m.newProject.modal.back}</Button>}
    <Button type="button" variant="primary" size="lg" spinnerSize={spinnerSize} {...data}
      onClick={aria ? () => { if (!nextBlocked && !busy) onNext(); } : onNext}
      {...aria
        ? { busy, "aria-disabled": nextBlocked || busy || undefined, "aria-describedby": nextBlocked ? nextDescribedBy : undefined }
        : { disabled: nextDisabled, loading: busy }}>
      {nextLabel ?? m.newProject.modal.next}
      {nextArrow && <ArrowRight className="size-4" aria-hidden />}
    </Button>
  </>;
}
