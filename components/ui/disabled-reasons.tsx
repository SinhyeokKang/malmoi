"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * **꺼진 컨트롤의 보이는 사유 줄** (responsive-app design §3 · 시안 AT8a · 2026-10-11 사용자 F7 — 모든 폭, DESIGN §7 등재는 D 배치).
 *
 * 꺼진 버튼(`aria-disabled` — 포커스를 받는다, DESIGN §6.65) 아래 `text-xs` muted 줄을 툴바 끝 오른쪽에 세운다. 버튼은 `aria-describedby`로 이 줄을 가리킨다.
 * ⚠️ **`title`·sr-only로 대신하지 않는다** — 터치에 hover가 없어 `title`은 폰에서 아무에게도 안 읽혔다(spec A-05). 같은 사유를 sr-only로 또 겹치면 두 번 읽힌다.
 * ⚠️ **원인이 같으면 줄 하나다** — 끊김·보관처럼 Sync·Publish가 같은 판정(`planActionAvailability`)으로 꺼지면 호출부가 같은 문장을 넘기고, 같은 문장은
 * 한 줄을 함께 가리킨다. 다르면 버튼 순서대로 쌓는다. 문장은 호출부가 이미 쓰던 사유 그대로다 — 이 프리미티브는 문구를 만들지 않는다.
 */
export type DisabledReason = { id: string; text: string };

/** 버튼 순서대로 사유(켜진 버튼은 `null`)를 받아 버튼별 describedby id와 쌓을 줄을 낸다. 같은 문장은 같은 id다. */
export function useDisabledReasons(texts: readonly (string | null | undefined)[]): { ids: (string | undefined)[]; reasons: DisabledReason[] } {
  const base = useId();
  const reasons: DisabledReason[] = [];
  const ids = texts.map(text => {
    if (text === null || text === undefined || text === "") return undefined;
    const same = reasons.find(reason => reason.text === text);
    if (same !== undefined) return same.id;
    const id = `${base}-reason-${reasons.length}`;
    reasons.push({ id, text });
    return id;
  });
  return { ids, reasons };
}

export function DisabledReasons({ reasons, className }: { reasons: readonly DisabledReason[]; className?: string }) {
  if (reasons.length === 0) return null;
  return (
    <div data-disabled-reasons="" className={cn("flex max-w-full flex-col items-end gap-0.5", className)}>
      {reasons.map(reason => (
        <p key={reason.id} id={reason.id} className="text-muted-foreground m-0 max-w-full text-right text-xs text-pretty">{reason.text}</p>
      ))}
    </div>
  );
}
