import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 형은 DESIGN §6.4가 정본이다. **`asChild`를 두지 않는다** — 링크에 버튼 형을 입히는 자리는
 * `buttonClass()`를 빌려 쓴다(그쪽은 `<a>`라 raw 태그 넷에 들지 않는다). 쓰는 곳이 생기기 전에
 * Slot 우회를 만들면 그 한 겹이 스캐너에서 태그를 지운다.
 *
 * 형은 DESIGN §6.4가 정본이다 — 여기 클래스는 그 표를 옮긴 것이고, 값을 바꾸려면 그 문서를 먼저 고친다.
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (§7). cva 베이스에 넣으면 짧아지지만
 * `focus-ring.test.ts`가 **여는 태그의 소스를 읽으므로** 그 순간 방어선이 이 파일을 통째로 못 본다 —
 * 링은 2026-09-06·07에 두 번 샜고 둘 다 "이 컨트롤만 기본값이 없었다"였다.
 * `focus-visible:ring-offset-1`은 **muted 표면 위**(사이드바 항목·값 칩 옆)에서만 호출부가 덧댄다:
 * `--ring == --border`라 그 표면에서는 링이 약하다.
 */
export const buttonClass = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        // **화면당 하나**다 — 확정 액션 (§6.4).
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70",
        default: cn(
          "border-input bg-background text-foreground hover:bg-accent border",
          "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
        ),
        // ⚠️ `bg-destructive`가 없다 — destructive는 **글자색 전용**이다 (§2.3).
        danger: cn(
          "border-destructive/40 text-destructive hover:bg-destructive/5 bg-background border",
          "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
        ),
        ghost: cn(
          "text-muted-foreground hover:text-foreground",
          "disabled:text-muted-foreground disabled:cursor-not-allowed",
        ),
        // 인라인 링크형 — 외부 링크가 아니라 **행동**이다("Sign in with another account").
        link: "text-blue-600 underline disabled:text-muted-foreground",
      },
      size: {
        md: "h-8 px-3",
        sm: "h-7 px-2 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonClass> & {
    /**
     * 진행 중 — **라벨을 교체한다.** 옆에 문구를 붙이면 폭이 흔들리고, 목록 안에서는 **누른 버튼
     * 하나만** 바뀌어야 어느 행이 도는지 보인다 (§6.4).
     */
    loading?: boolean;
    loadingLabel?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClass({ variant, size }), "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  );
}
