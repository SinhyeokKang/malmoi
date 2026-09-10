import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * 세그먼트 컨트롤 — **한 표면 안에서 보기를 바꾸는** 컨트롤이다 (시안 `SegmentedControls`).
 *
 * **형이 둘이다**: 상태를 클라이언트가 들면 `SegmentedControl`(버튼), **URL이 들면
 * `SegmentedLinks`(링크)**. 뒤의 것이 기본이다 — 필터·탭은 뒤로가기·공유·새로고침이 그냥 돼야 하고,
 * 그러려면 주소가 진실이어야 한다 (`logs`의 `?cursor=`와 같은 판정).
 */

/** 트랙이 캔버스색이라 흰 패널 위에서 홈처럼 파인다 — 선택된 칸만 흰색으로 떠오른다. */
const TRACK = "bg-canvas inline-flex items-center gap-1 rounded-sm p-1";
const SEGMENT = "cursor-pointer rounded px-2 py-1 text-center text-sm";
const SELECTED = "bg-background shadow-low font-medium";
const UNSELECTED = "text-muted-foreground hover:text-foreground";

/**
 * ⚠️ **`role="tablist"`가 아니다.** ARIA 탭은 패널과 `aria-controls`로 묶이고 화살표 키 이동이
 * 계약인데, 이 컨트롤은 그 계약을 안 든다 — `radiogroup`이 실제 동작(하나만 고른다)과 맞고
 * 라디오는 화살표 이동이 브라우저 기본이 아니어도 어긋나지 않는다.
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (DESIGN §7) — `focus-ring.test.ts`가 여는 태그의
 * 소스를 읽으므로 공유 상수로 올리면 이 파일을 통째로 못 본다.
 */
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
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(TRACK, "flex", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-visible:ring-ring flex-1 focus-visible:ring-[3px] focus-visible:outline-none",
              SEGMENT,
              selected ? SELECTED : UNSELECTED,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 같은 형의 **링크** 판. 상태가 URL에 있으므로 `aria-current="page"`가 선택을 말한다.
 *
 * ⚠️ **`<nav>`다.** 링크 묶음이라 라디오 그룹이 아니고, `role="radio"`를 링크에 얹으면 스크린리더가
 * "고르는 것"이라 읽는데 실제로는 **이동**한다.
 *
 * ⚠️ 여기는 링을 상수로 붙여도 방어선이 안 좁아진다 — `focus-ring` 스캐너의 네 태그는
 * `button`·`input`·`select`·`textarea`이고 `<a>`는 그 밖이다 (`ButtonLink`와 같은 이유).
 */
export function SegmentedLinks({
  label,
  current,
  options,
  className,
}: {
  label: string;
  current: string;
  options: readonly { value: string; label: string; href: string }[];
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
              "focus-visible:ring-ring min-w-11 focus-visible:ring-[3px] focus-visible:outline-none",
              SEGMENT,
              selected ? SELECTED : UNSELECTED,
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
