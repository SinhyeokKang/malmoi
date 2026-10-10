import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Children, isValidElement, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type Ref } from "react";

import { isPlainPrimaryClick } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

/**
 * 형은 DESIGN §6.4가 정본이다. **`asChild`를 두지 않는다** — 링크에 버튼 형을 입히는 자리는
 * `ButtonLink`를 쓴다(그쪽은 `<a>`라 raw 태그 넷에 들지 않는다). 쓰는 곳이 생기기 전에
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
 * ⚠️ **라벨 weight가 500(medium)이다** (2026-09-30 사용자 — 2026-09-10에 400으로 내렸던 것을 되돌렸다).
 * 헤더 내비·링크(`components/public-shell/header.tsx`)도 같은 무게다 — 누르는 것은 한 벌로 읽힌다.
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (§7). cva 베이스에 넣으면 짧아지지만
 * `focus-ring.test.ts`가 **여는 태그의 소스를 읽으므로** 그 순간 방어선이 이 파일을 통째로 못 본다 —
 * 링은 2026-09-06·07에 두 번 샜고 둘 다 "이 컨트롤만 기본값이 없었다"였다.
 * ⚠️ **`focus-visible:ring-offset-1`의 실물 사용처가 0건이다** (2026-09-13 실측). 이 자리에
 * *"값 칩 옆 하나(온보딩의 리포 되돌리기)에서만 호출부가 덧댄다"*고 적혀 있었는데 그 호출부는
 * 이미 사라졌다 — 규칙이 아니라 **그 밑의 사실이 낡았다**(DESIGN §7도 같은 커밋에서 고쳤다).
 * ⚠️ **2026-09-11에 `--ring`이 blue-400이 됐고, 그것이 이 offset을 다시 쓸모 있게 한다** — 대비가
 * 낮아서(흰 배경 **2.54:1**, 하한 3:1 미달) 경계가 한 겹 더 있는 자리가 유리하다. 그전엔
 * `--ring == --border`라 링이 흰 배경에서 실질적으로 없었다(1.19:1) — DESIGN §7.
 */
/**
 * ⚠️ **`disabled:` 유틸리티마다 `aria-disabled:` 짝이 선다** (2026-09-17 사용자 — 전역 규칙).
 *
 * pending 표시는 `Button`의 `loading`이 거는 **`disabled` 속성 하나**가 만든다. 그런데 그 속성을
 * 쓸 수 없는 자리가 계속 생긴다 — `<a>`에는 없는 속성이고(`NewProjectButton`), Radix Dialog
 * 트리거는 `disabled`면 닫을 때 포커스를 잃는다(`SyncButton`). 그 자리들이 각자 `aria-disabled:`
 * 철자를 발명해 **같은 pending이 화면마다 다르게 보였다**: 로그인은 회색 + not-allowed, Home
 * sync는 글자만 회색, New project는 커서만 바뀌었다. 소비자는 이제 **속성만** 세우면 된다.
 *
 * ⚠️ **짝을 빠뜨리면 `disabled_pairing` 메타 테스트가 red다** — 새 variant를 만드는 사람이 한쪽만
 * 적는 것이 이 규칙이 실제로 깨지는 유일한 경로이고, 그것은 화면에도 다른 테스트에도 안 나타난다.
 *
 * ⚠️ **`aria-disabled:hover:*`가 `disabled:` 쪽보다 하나 많은 자리가 있다**(primary의
 * `aria-disabled:hover:bg-muted`). 진짜 `disabled`는 브라우저가 hover를 안 태우지만 `aria-disabled`는
 * 태우므로, 그것이 없으면 **회색으로 죽은 버튼이 hover에서 검게 살아난다.** 메타 테스트는 짝의
 * 존재만 보고 여분을 금지하지 않는다 — 이 비대칭이 그 이유다.
 */
/**
 * **터치 히트 영역** (responsive-public design §2 · 2026-10-07 사용자) — 보이는 크기는 그대로 두고 `pointer: coarse`일 때 `::after`가
 * 누르는 영역만 44까지 넓힌다. 대상은 44에 가장 못 미치는 `sm`(28)·`icon-md`(32) 둘이다.
 * ⚠️ **`relative`는 수식어 없이 둔다** — `pointer-coarse:relative`로 두면 호출부의 `absolute`를 `cn()`이 못 걷고 터치 기기에서만
 * 덮어써 절대 배치 버튼이 흐름으로 돌아온다. 수식어가 없으면 twMerge가 호출부 위치 클래스를 이기게 한다(그것도 `::after`의 기준 상자다).
 * 이웃한 둘의 넓힌 영역이 겹치면 뒤 형제가 이긴다 — 보이는 버튼 위에서는 늘 그 버튼이다.
 */
const TOUCH_TARGET = "relative pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-1/2";

export const buttonClass = cva(
  cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap",
    "transition-colors disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        // **화면당 하나**다 — 확정 액션 (§6.4).
        /**
         * ⚠️ **hover에서 밝아진다** (2026-09-30 사용자 — "면색이 좀 더 발광하게"). `bg-primary/85`(흰 배경 위 ≈#3a3a3a)다.
         * 2026-09-13에는 캔버스대로 `--foreground`(#0a0a0a)로 **어두워지게** 했었는데, 둘이 거의 같은 검정이라 hover가 안 보였다.
         * 눈으로는 "둘 다 회색"이라 리뷰가 못 잡는 부류이므로 computed style로 잰다.
         */
        primary: cn(
          "bg-primary text-primary-foreground hover:bg-primary/85",
          "disabled:bg-muted disabled:text-muted-foreground",
          "aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:hover:bg-muted",
        ),
        /**
         * ⚠️ **hover가 `--accent`(#f5f5f5)가 아니라 `--primary-foreground`(#fafafa)다**
         * (2026-09-13 — 같은 실측). 그 토큰이 **역할을 하나 더 든다**는 뜻이고 DESIGN §6.2가
         * 그것을 등재한다 — 새 raw 색을 늘리는 대신 기존 토큰에 역할을 더하는 쪽이다.
         */
        default: cn(
          "border-input bg-background text-foreground hover:bg-primary-foreground border",
          "disabled:text-muted-foreground disabled:hover:bg-transparent",
          // ⚠️ `bg-background`이고 `bg-transparent`가 아니다 — 짝인 `disabled:hover:bg-transparent`는
          //    브라우저가 disabled에 hover를 안 태워 **한 번도 적용된 적이 없고**, 그대로 복제하면
          //    aria-disabled에서만 배경이 투명해진다(2026-09-17 실측: 흰색 → rgba(0,0,0,0)).
          "aria-disabled:text-muted-foreground aria-disabled:hover:bg-background",
        ),
        /**
         * ⚠️ **연한 붉은 면 + 붉은 글자이고 테두리가 없다** (2026-09-30 사용자 — 흰 면 + 붉은 테두리 `/40`에서 바꿨다).
         * 면은 `destructive`의 알파라 새 토큰이 없다.
         *
         * ⚠️ **면·글자가 Sources 실패 칩(`IconTile` `bg-destructive/8 text-destructive`)과 같다** (2026-09-30 사용자 — 붉은 면 넷을 한 조합으로
         * 통일했다: 이 버튼 · 실패 알약 · Logs 글리프 칩 · Sources 칩). ⚠️ **대비가 약 4.3:1이다** — AA(4.5)에 조금 못 미친다(red-700이면 5.5:1이었다).
         *
         * ⚠️ **꺼져도 destructive 계열을 유지한다** (2026-09-20 — 사용자가 화면에서 잡았다).
         * 이 variant의 소비자가 **전부 되돌릴 수 없는 동작**이라(Discard · Archive · Sign out everywhere · Unlink ·
         * Remove · Revoke) 회색으로 접으면 **"이건 파괴적이다"라는 신호가 사라진다.** 꺼진 형은 면 `/5` · 글자
         * `destructive/40` — **면과 글자를 반드시 짝으로 옅힌다**(한쪽만 옅히면 꺼진 것으로도 켜진 것으로도 안 읽힌다).
         * 꺼진 글자의 낮은 대비는 **꺼진 컨트롤에 사유를 반드시 붙이는 규칙**(DESIGN §6.65)이 진다.
         */
        danger: cn(
          "bg-destructive/8 text-destructive hover:bg-destructive/12",
          "disabled:bg-destructive/5 disabled:text-destructive/40 disabled:hover:bg-destructive/5",
          // ⚠️ `aria-disabled`는 브라우저가 hover를 태우므로 면을 붙들어 둔다 — 없으면 꺼진 버튼이 hover에서 짙어진다.
          "aria-disabled:bg-destructive/5 aria-disabled:text-destructive/40 aria-disabled:hover:bg-destructive/5",
        ),
        ghost: cn(
          "text-muted-foreground hover:text-foreground",
          // hover가 글자색을 되살리는 유일한 variant라 여기만 짝이 하나 더 필요하다.
          "disabled:text-muted-foreground aria-disabled:text-muted-foreground aria-disabled:hover:text-muted-foreground",
        ),
        // 인라인 링크형 — 외부 링크가 아니라 **행동**이다("Sign in with another account").
        link: "text-link disabled:text-muted-foreground aria-disabled:text-muted-foreground",
      },
      size: {
        /**
         * ⚠️ **32 → 36으로 올렸다** (2026-09-11 사용자 — 시안의 기본 버튼이 36이다). §6.4가 "마지막
         * 화면이 옮겨온 뒤 base를 바꾼다"로 미뤄 둔 그 교체이고, 미룬 이유(소비자 26파일이 함께
         * 움직인다)는 그대로이되 **시안의 기본값이 드러난 지금이 그 시점**이다. 문자 버튼 세 크기는 유지하고, 실재하는 정방형 크기는 `icon-*`가 든다.
         */
        md: "h-9 rounded-md px-3",
        sm: cn("h-7 rounded-sm px-2 text-xs", TOUCH_TARGET),
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
        "icon-xs": "size-6 rounded-sm px-0",
        "icon-sm": "size-7 rounded-sm px-0 text-xs",
        "icon-md": cn("size-8 rounded-md px-0", TOUCH_TARGET),
        "icon-lg": "size-9 rounded-md px-0",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> } &
  VariantProps<typeof buttonClass> & {
    /**
     * 진행 중 — **스피너만 세우고 라벨은 그대로 둔다** (2026-09-10 사용자 규칙 변경).
     *
     * ⚠️ **`loadingLabel`이 없어졌다.** 전에는 문구까지 교체했는데(`"Saving…"`), 그러면 폭이 흔들리고
     * 문구를 각 화면이 따로 들어야 했다 — 죽은 문구 16개가 그 대가였다. 목록 안에서 어느 행이
     * 도는지는 **스피너 위치**가 이미 말한다.
     */
    loading?: boolean;
    /** 같은 md 버튼도 14/16px가 실재하므로 버튼 크기와 독립이다. 기본 16px는 그대로다. */
    spinnerSize?: "sm" | "md";
    /**
     * 진행 중이되 **포커스를 지킨다** (audit #32 — DESIGN §6.65). `loading`과 같은 스피너이고 `disabled` 대신
     * `aria-disabled` + `aria-busy`를 걸며 클릭은 막는다.
     *
     * ⚠️ **Dialog 트리거 전용이다.** Radix는 닫힐 때 포커스를 트리거로 돌려주는데, 확정과 같은 커밋에 트리거가
     * `loading`(진짜 `disabled`)이 되면 그 포커스가 `body`로 빠진다 — Revoke·Remove·Rotate·Archive·Disconnect가
     * 전부 그 모양이었다. 폼의 [Save]는 여기가 아니다: 저장 중 `loading`이 규칙이고(§6.6) 끝난 뒤 착지한다
     * (`useLandAfter`). ⚠️ **`onClick`을 부르지 않고 `preventDefault`한다** — `DialogTrigger asChild`의 토글은 Slot이
     * 이 `onClick`에 합쳐 넘기므로 안 부르면 Dialog가 다시 열리지 않고, 기본 동작을 막아 submit 버튼도 제출하지 않는다.
     */
    busy?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  spinnerSize = "md",
  loading = false,
  busy = false,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClass({ variant, size }), "focus-visible:ring-ring focus-visible:outline-none", (variant ?? "default") === "default" ? "focus-visible:border-ring focus-visible:ring-1" : "focus-visible:ring-2", className)}
      disabled={disabled === true || loading}
      {...props}
      aria-disabled={busy ? true : props["aria-disabled"]}
      aria-busy={busy ? true : props["aria-busy"]}
      onClick={busy ? event => event.preventDefault() : onClick}
    >
      {/* 스피너가 라벨 **앞에** 선다 — 16px는 §6.8의 기본 크기다. */}
      {(loading || busy) && <Loader2 className={cn(spinnerSize === "sm" ? "size-3.5" : "size-4", "animate-spin")} aria-hidden />}
      {glyphSlot(children, loading || busy)}
    </button>
  );
}

/**
 * **아이콘이 있는 버튼은 스피너를 더하지 않고 교체한다** (DESIGN §6.4 `Button loading` · 2026-10-01 ux-drift-unify T13) — 더하면 버튼이
 * 글리프 하나만큼 넓어졌다 좁아진다. 전엔 그 교체를 호출부 다섯이 `pending ? <Loader2/> : <Icon/>` 삼항으로 손수 들었다.
 *
 * ⚠️ **앞 글리프 = `aria-hidden`을 든 첫 자식 요소**다 — 장식 글리프만 그 표식을 든다(§7). 라벨 글자·라벨 조각(`<span>`)은 교체되지
 * 않는다. 표식이 없는 글리프(브랜드 마크 `GithubIcon`)는 더하는 쪽에 남는다. CSS 형제 선택자로 숨기지 않은 이유: DOM에 남으면
 * 스크린리더·테스트가 두 글리프를 보고, jsdom은 CSS를 안 태워 검증할 수 없다.
 */
export function glyphSlot(children: ReactNode, spinning: boolean): ReactNode {
  // ⚠️ 돌지 않을 때도 배열로 낸다 — 두 상태의 key가 같아야 라벨 요소가 토글마다 다시 마운트되지 않는다.
  const all = Children.toArray(children);
  const [first, ...rest] = all;
  const decorative = isValidElement<{ "aria-hidden"?: unknown }>(first) && (first.props["aria-hidden"] === true || first.props["aria-hidden"] === "true");
  return spinning && decorative ? rest : all;
}

/**
 * 버튼 형을 입은 **링크**. 주 행동이 라우트 이동인 자리("New project"·"Open translations")가 이것이다.
 *
 * ⚠️ **`Button`의 `asChild`가 아니라 별도 컴포넌트다** — Slot 한 겹이 `<button>` 태그를 지워
 * `focus-ring` 스캐너가 그 파일을 못 보게 된다 (DESIGN §7). 여기는 `<a>`라 스캐너의 네 태그가 아니고,
 * 그래서 링을 상수로 붙여도 방어선이 좁아지지 않는다.
 */
export function ButtonLink({
  href, variant, size, className, onClick, onNavigate, children, external = false, newTab = false,
  rel, target, busy = false, ...props
}: Omit<ComponentProps<typeof Link>, "href"> & VariantProps<typeof buttonClass> & {
  href: string;
  external?: boolean;
  newTab?: boolean;
  busy?: boolean;
}) {
  const safeRel = external || newTab || target === "_blank"
    ? [...new Set([...(rel?.split(/\s+/).filter(Boolean) ?? []), "noopener", "noreferrer"])].join(" ") : rel;
  const content = <>{busy && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}{glyphSlot(children, busy)}</>;
  const classes = cn(buttonClass({ variant, size }), "focus-visible:ring-ring focus-visible:outline-none", (variant ?? "default") === "default" ? "focus-visible:border-ring focus-visible:ring-1" : "focus-visible:ring-2", className);
  const shared = { ...props, href, target: newTab ? "_blank" : target, rel: safeRel,
    "aria-disabled": busy ? true : props["aria-disabled"], "aria-busy": busy ? true : props["aria-busy"] };
  // 외부 a는 일반 클릭만 막고, Next onNavigate는 같은 탭 내부 이동만 차단한다.
  if (external) return <a {...shared} onClick={busy ? event => {
    if (!newTab && (!target || target === "_self") && isPlainPrimaryClick(event)) event.preventDefault();
    else onClick?.(event);
  } : onClick} className={classes}>{content}</a>;
  return <Link {...shared} onClick={onClick} onNavigate={busy ? event => event.preventDefault() : onNavigate} className={classes}>{content}</Link>;
}
