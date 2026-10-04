"use client";

import { useMessages } from "@/components/i18n/messages-provider";
import { ArrowRight } from "lucide-react";
import { Button } from "./button";

/** 온보딩 버튼군만 소유한다. 문장·바닥 배치는 LargeModal이 유지한다. */
export function WizardFooter({
  showBack = false, onBack, nextLabel, nextArrow = true, nextDisabled = false, busy = false, onNext,
}: {
  showBack?: boolean;
  onBack?: () => void;
  nextLabel?: string;
  nextArrow?: boolean;
  nextDisabled?: boolean;
  busy?: boolean;
  onNext: () => void;
}) {
  const m = useMessages();
  return <>
    {showBack && <Button type="button" size="lg" onClick={onBack} disabled={busy}>{m.newProject.modal.back}</Button>}
    <Button type="button" variant="primary" size="lg" onClick={onNext} disabled={nextDisabled} loading={busy}>
      {nextLabel ?? m.newProject.modal.next}
      {nextArrow && <ArrowRight className="size-4" aria-hidden />}
    </Button>
  </>;
}
