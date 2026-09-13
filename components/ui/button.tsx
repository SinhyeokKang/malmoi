import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 형은 DESIGN §6.4가 정본이다. **`asChild`를 두지 않는다** — 링크에 버튼 형을 입히는 자리는
 * `buttonClass()`를 빌려 쓴다(그쪽은 `<a>`라 raw 태그 넷에 들지 않는다). 쓰는 곳이 생기기 전에
 * Slot 우회를 만들면 그 한 겹이 스캐너에서 태그를 지운다.
 *
 * 형은 DESIGN §6.4가 정본이다 — 여기 클래스는 그 표를 옮긴 것이고, 값을 바꾸려면 그 문서를 먼저 고친다.
 *
 * ⚠️ **`cursor-pointer`가 base에 있다.** Tailwind v4가 preflight에서 `button`의 커서를 `default`로
 * 되돌리므로(v3와 다르다) 명시하지 않으면 **버튼 위에서 손가락 커서가 안 나온다** — 눌리는
 * 요소로 안 보인다. `disabled:cursor-not-allowed`가 그 짝이다.
 *
 * ⚠️ **radius가 base가 아니라 `size`에 붙어 있다** (2026-09-11). 크기가 커질수록 한 칸씩 둥글어진다 —
 * `sm` 8 · `md` 10 · `lg` 12. **base에 두고 size에서 덮으면** cva가 충돌하는 클래스 둘을 내고
 * `cn()`의 twMerge가 이기는 것에 기대게 되는데, 그 의존을 만들지 않는 것이 이 배치의 이유다.
 *
 * ⚠️ **라벨 weight가 400이다** (2026-09-10 사용자 — 8-1b에서 한 단계 내렸다). 본문 기본이 300이고
 * 가장 두꺼운 서체가 500이므로(§4), 버튼은 그 사이에 앉는다 — 500이면 화면에서 버튼만 도드라진다.
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (§7). cva 베이스에 넣으면 짧아지지만
 * `focus-ring.test.ts`가 **여는 태그의 소스를 읽으므로** 그 순간 방어선이 이 파일을 통째로 못 본다 —
 * 링은 2026-09-06·07에 두 번 샜고 둘 다 "이 컨트롤만 기본값이 없었다"였다.
 * `focus-visible:ring-offset-1`은 값 칩 옆 하나(온보딩의 리포 되돌리기)에서만 호출부가 덧댄다.
 * ⚠️ **2026-09-11에 `--ring`이 blue-400이 됐고, 그것이 이 offset을 다시 쓸모 있게 한다** — 대비가
 * 낮아서(흰 배경 **2.54:1**, 하한 3:1 미달) 경계가 한 겹 더 있는 자리가 유리하다. 그전엔
 * `--ring == --border`라 링이 흰 배경에서 실질적으로 없었다(1.19:1) — DESIGN §7.
 */
export const buttonClass = cva(
  cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-normal whitespace-nowrap",
    "transition-colors disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        // **화면당 하나**다 — 확정 액션 (§6.4).
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70",
        default: cn(
          "border-input bg-background text-foreground hover:bg-accent border",
          "disabled:text-muted-foreground disabled:hover:bg-transparent",
        ),
        // ⚠️ `bg-destructive`가 없다 — destructive는 **글자색 전용**이다 (§2.3).
        danger: cn(
          "border-destructive/40 text-destructive hover:bg-destructive/5 bg-background border",
          "disabled:text-muted-foreground disabled:hover:bg-transparent",
        ),
        ghost: cn(
          "text-muted-foreground hover:text-foreground",
          "disabled:text-muted-foreground",
        ),
        // 인라인 링크형 — 외부 링크가 아니라 **행동**이다("Sign in with another account").
        link: "text-blue-600 disabled:text-muted-foreground",
      },
      size: {
        /**
         * ⚠️ **32 → 36으로 올렸다** (2026-09-11 사용자 — 시안의 기본 버튼이 36이다). §6.4가 "마지막
         * 화면이 옮겨온 뒤 base를 바꾼다"로 미뤄 둔 그 교체이고, 미룬 이유(소비자 26파일이 함께
         * 움직인다)는 그대로이되 **시안의 기본값이 드러난 지금이 그 시점**이다. `size`를 넷으로
         * 늘리지 않는 것이 요지다 — 그러면 "어느 걸 쓰나"가 매 화면 판단이 된다.
         */
        md: "h-9 rounded-md px-3",
        sm: "h-7 rounded-sm px-2 text-xs",
        /**
         * **셸 밖 카드 전용이다** (8-1b — 로그인·초대 수락 둘뿐이다). 시안은 38px인데
         * `h-10`(40px)을 쓴다 — 2px 때문에 임의 치수를 만들지 않는다 (README 규약 6).
         * ⚠️ **그때의 근거는 "임의값이 `ring-[3px]` 하나뿐"이었고, 2026-09-11에 링이 `ring-2`가 되며
         * 그 하나도 사라졌다** — 근거가 없어진 것이 아니라 더 세졌다(지금 임의 치수는 0이다).
         *
         * ⚠️ **base는 2026-09-11에 36으로 올라갔다** — 위 `md` 주석. 그때까지 이 자리에 "마지막 화면이
         * 옮겨온 뒤 기본값을 바꾼다"가 적혀 있었고, 그 미루기의 대상은 **40이 아니라 36**이었다는 것이
         * 8-3에서 드러났다. `lg`(40)은 셸 밖 전용으로 남는다 — 4px 차이가 그 화면의 여백에서 온다.
         *
         * ⚠️ **radius가 여기 있다** (2026-09-11) — base에서 내려왔다. `md`(10)보다 한 칸 둥근 12이고,
         * 그 차이가 셸 안팎을 시각적으로 가른다.
         *
         * ⚠️ **소비자가 셋이 됐다** (new-project-modal T7): 로그인·초대 수락에 **온보딩 모달의 바닥
         * 버튼**이 붙는다. 그 모달은 dim 위에 뜬 표면이라 셸 안이 아니고, 핸드오프의 40/12가 이
         * 크기와 정확히 같다 — 새 `size`를 만들면 "어느 걸 쓰나"가 매 화면 판단이 된다.
         */
        lg: "h-10 rounded-lg px-4",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonClass> & {
    /**
     * 진행 중 — **스피너만 세우고 라벨은 그대로 둔다** (2026-09-10 사용자 규칙 변경).
     *
     * ⚠️ **`loadingLabel`이 없어졌다.** 전에는 문구까지 교체했는데(`"Saving…"`), 그러면 폭이 흔들리고
     * 문구를 각 화면이 따로 들어야 했다 — 죽은 문구 16개가 그 대가였다. 목록 안에서 어느 행이
     * 도는지는 **스피너 위치**가 이미 말한다.
     */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClass({ variant, size }), "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {/* 스피너가 라벨 **앞에** 선다 — 16px는 §6.8의 기본 크기다. */}
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/**
 * 버튼 형을 입은 **링크**. 주 행동이 라우트 이동인 자리("New project"·"Open translations")가 이것이다.
 *
 * ⚠️ **`Button`의 `asChild`가 아니라 별도 컴포넌트다** — Slot 한 겹이 `<button>` 태그를 지워
 * `focus-ring` 스캐너가 그 파일을 못 보게 된다 (DESIGN §7). 여기는 `<a>`라 스캐너의 네 태그가 아니고,
 * 그래서 링을 상수로 붙여도 방어선이 좁아지지 않는다.
 */
export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: VariantProps<typeof buttonClass> & {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonClass({ variant, size }), "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)}
    >
      {children}
    </Link>
  );
}
