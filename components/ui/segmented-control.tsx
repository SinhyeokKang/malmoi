import { cn } from "@/lib/utils";

/**
 * 세그먼트 컨트롤 — **한 표면 안에서 보기를 바꾸는** 컨트롤이다 (시안 `SegmentedControls`).
 * 라우트를 바꾸는 것은 탭이 아니라 링크이므로, 그 자리에 이것을 쓰지 않는다.
 *
 * ⚠️ **`role="tablist"`가 아니다.** ARIA 탭은 패널과 `aria-controls`로 묶이고 화살표 키 이동이
 * 계약인데, 이 컨트롤은 그 계약을 안 든다 — `radiogroup`이 실제 동작(하나만 고른다)과 맞고
 * 라디오는 화살표 이동이 브라우저 기본이 아니어도 어긋나지 않는다.
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (DESIGN §7) — `focus-ring.test.ts`가 여는 태그의
 * 소스를 읽으므로 cva 베이스나 공유 상수로 올리면 이 파일을 통째로 못 본다.
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
    // 트랙이 캔버스색이라 흰 패널 위에서 홈처럼 파인다 — 선택된 칸만 흰색으로 떠오른다.
    <div role="radiogroup" aria-label={label} className={cn("bg-canvas flex gap-1 rounded-sm p-1", className)}>
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
              "focus-visible:ring-ring flex-1 cursor-pointer rounded px-2 py-1 text-sm focus-visible:ring-[3px] focus-visible:outline-none",
              selected ? "bg-background shadow-low font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
