import type { ReactNode } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio";
import { CountBadge, type CountProps } from "@/components/ui/count-badge";
import { SEGMENT, SELECTED, TRACK, UNSELECTED } from "@/components/ui/segment";
import { cn } from "@/lib/utils";

/**
 * 세그먼트 컨트롤 — **한 표면 안에서 보기를 바꾸는** 컨트롤이다 (시안 `SegmentedControls`).
 *
 * 상태를 클라이언트가 들고, 선택과 roving focus는 Radix가 소유한다.
 */

/**
 * 칸 하나가 실을 수 있는 것 — 라벨은 필수, icon과 count는 선택이다 (2026-09-11 사용자).
 *
 * ⚠️ **icon은 ReactNode 하나다** — 실제 국기의 치수·aria-hidden은 호출부에 남고, count의 모양은
 * `CountBadge` 한 곳이 든다. 값 슬롯과 개수를 섞지 않도록 count+countLabel의 짝을 강제한다.
 *
 * ⚠️ **배지는 `CountBadge` 프리미티브를 쓴다** — 저쪽은 선택/미선택에 상관없이 `bg-primary` 고정이라
 * 흰 칸 위와 캔버스 칸 위의 대비가 갈렸다. `neutral`은 `--foreground`의 알파라 두 배경 모두에서
 * 같은 관계를 유지한다.
 */
export type SegmentContent = {
  label: string;
  /** 라벨 왼쪽 장식. 실제 국기·글리프의 치수와 aria-hidden은 호출부가 보존한다. */
  icon?: ReactNode;
} & CountProps;

/** 칸 안쪽 — `Tabs`도 같은 몸통을 쓴다. 선택·roving focus와 무관한 icon → label → count 순서를 유지한다. */
export function SegmentBody({ icon, label, count, countLabel }: SegmentContent) {
  return (
    <>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && <CountBadge count={count} label={countLabel} className="shrink-0" />}
    </>
  );
}

/** 단일 선택 보기 전환기. 선택과 roving focus는 Radix가 소유한다. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  "aria-describedby": describedBy,
  className,
}: {
  /** 그룹의 이름. 세그먼트 라벨만으로는 "무엇의 General인가"가 안 드러난다. */
  label: string;
  value: T;
  options: readonly ({ value: T } & SegmentContent)[];
  onChange: (value: T) => void;
  /** 그룹 아래 설명 한 줄의 id — 고른 값이 무엇을 뜻하는지 말하는 문장이 있을 때(`/mcp` 연결 방식). */
  "aria-describedby"?: string;
  className?: string;
}) {
  return (
    <RadioGroup
      aria-label={label}
      aria-describedby={describedBy}
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) onChange(option.value);
      }}
      loop
      className={cn(TRACK, "flex", className)}
      onKeyDown={(event) => {
        // Home/End에서도 포커스와 함께 선택을 옮긴다 — Radix는 화살표에서만 선택한다.
        if (event.key !== "Home" && event.key !== "End") return;
        const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        const target = event.key === "Home" ? items[0] : items[items.length - 1];
        if (!target) return;
        event.preventDefault();
        target.focus();
        target.click();
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            className={cn(
              "focus-visible:ring-ring flex-1 focus-visible:ring-2 focus-visible:outline-none",
              SEGMENT,
              selected ? SELECTED : UNSELECTED,
            )}
          >
            <SegmentBody {...option} />
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
