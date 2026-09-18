import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * 세그먼트 컨트롤 — **한 표면 안에서 보기를 바꾸는** 컨트롤이다 (시안 `SegmentedControls`).
 *
 * **형이 둘이다**: 상태를 클라이언트가 들면 `SegmentedControl`(버튼), **URL이 들면
 * `SegmentedLinks`(링크)**. 뒤의 것이 기본이다 — 필터·탭은 뒤로가기·공유·새로고침이 그냥 돼야 하고,
 * 그러려면 주소가 진실이어야 한다 (`logs`의 `?cursor=`와 같은 판정).
 */

/**
 * 트랙이 캔버스색이라 흰 패널 위에서 홈처럼 파인다 — 선택된 칸만 흰색으로 떠오른다.
 *
 * ⚠️ **칸의 radius가 `md` 버튼과 같다** (2026-09-11 사용자). 선택된 칸은 흰 배경 + `shadow-low`로
 * 떠올라 **버튼처럼 보이고**, 툴바에서 실제 `Button`과 나란히 선다 — 모서리가 다르면 둘이 다른
 * 계열로 읽힌다. **`size`를 따라 바뀌지 않는다**: 이 컨트롤엔 크기 축이 없다.
 *
 * ⚠️ **트랙은 한 단계 크다** — `p-1`(4px)만큼 바깥이라 동심이 되는 값은 14px인데 스케일에 없고,
 * `rounded-lg`(12)가 가장 가깝다. 트랙을 칸과 같게 두면 안쪽 모서리가 바깥으로 밀려 보인다.
 */
const TRACK = "bg-canvas inline-flex items-center gap-1 rounded-lg p-1";
/** ⚠️ **`gap-1.5`가 base다** — 아이콘·배지가 선택이라 호출부가 있을 때만 붙이면 간격 규칙이 흩어진다. */
const SEGMENT = "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center text-sm";
const SELECTED = "bg-background shadow-low font-medium";
const UNSELECTED = "text-muted-foreground hover:text-foreground";

/**
 * 칸 하나가 실을 수 있는 것 — 라벨은 필수, 아이콘과 배지는 선택이다 (2026-09-11 사용자).
 *
 * ⚠️ **children이 아니라 prop이다.** bugshot-2는 `TabsTrigger`의 children으로 아이콘·배지를 직접
 * 꽂는데(`h-3.5 w-3.5 shrink-0` · `ml-0.5 h-5 min-w-5 px-1.5 text-[10px]`), 그 치수를 호출부마다
 * 손으로 반복하다 **배지 크기가 두 벌로 갈렸다**(h-5 / h-4). prop이면 규칙이 여기 한 곳에 남는다.
 *
 * ⚠️ **배지는 `Badge` 프리미티브를 쓴다** — 저쪽은 선택/미선택에 상관없이 `bg-primary` 고정이라
 * 흰 칸 위와 캔버스 칸 위의 대비가 갈렸다. `neutral`은 `--foreground`의 알파라 두 배경 모두에서
 * 같은 관계를 유지한다.
 */
export type SegmentContent = {
  label: string;
  /**
   * 라벨 **맨 왼쪽** — `icon`보다도 앞이다.
   *
   * ⚠️ **`icon`으로 대신할 수 없다.** 그쪽은 `ComponentType`(lucide 컴포넌트)인데 국기는 컴포넌트가
   * 아니라 인라인 `style`의 `background-image`다 (DESIGN §6.7). 치수·`aria-hidden`은 호출부
   * 책임이고, 여기서 주는 것은 자리뿐이다.
   */
  leading?: ReactNode;
  /** 라벨 **왼쪽**. `lucide-react` 컴포넌트를 그대로 넘긴다. */
  icon?: ComponentType<{ className?: string }>;
  /**
   * 라벨 **오른쪽**의 개수.
   *
   * ⚠️ **0도 보인다** — `undefined`와 `0`이 다르다. "그 탭에 아무것도 없다"는 그 자체로 정보이고,
   * `badge && …`로 쓰면 0이 falsy라 조용히 사라진다 (`NavItem.badge`와 같은 판정).
   */
  badge?: number;
};

/**
 * 칸 안쪽 — 두 형(버튼·링크)이 같은 것을 그린다.
 *
 * ⚠️ **아이콘에 `aria-hidden`을 붙인다.** 라벨이 늘 옆에 있으므로 아이콘은 장식이다 — bugshot-2는
 * 이걸 한 곳도 안 붙이고 lucide 기본값에 기대고 있다.
 */
function SegmentBody({ leading, icon: Icon, label, badge }: SegmentContent) {
  return (
    <>
      {leading}
      {Icon !== undefined && <Icon className="size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 truncate">{label}</span>
      {badge !== undefined && (
        <Badge variant="neutral" className="shrink-0">
          {badge}
        </Badge>
      )}
    </>
  );
}

/** 단일 선택 보기 전환기. 선택과 roving focus는 Radix가 소유한다. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** 그룹의 이름. 세그먼트 라벨만으로는 "무엇의 General인가"가 안 드러난다. */
  label: string;
  value: T;
  options: readonly ({ value: T } & SegmentContent)[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <RadioGroup
      aria-label={label}
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

/**
 * 같은 형의 **링크** 판. 상태가 URL에 있으므로 `aria-current="page"`가 선택을 말한다.
 *
 * ⚠️ **`<nav>`다.** 링크 묶음이라 라디오 그룹이 아니고, `role="radio"`를 링크에 얹으면 스크린리더가
 * "고르는 것"이라 읽는데 실제로는 **이동**한다.
 *
 */
export function SegmentedLinks({
  label,
  current,
  options,
  className,
}: {
  label: string;
  current: string;
  options: readonly ({ value: string; href: string } & SegmentContent)[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(TRACK, className)}>
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring min-w-11 focus-visible:ring-2 focus-visible:outline-none",
              SEGMENT,
              selected ? SELECTED : UNSELECTED,
            )}
          >
            <SegmentBody {...option} />
          </Link>
        );
      })}
    </nav>
  );
}
