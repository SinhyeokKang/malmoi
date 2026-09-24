"use client";

import { useImageFallback } from "@/components/ui/image-tile";
import { toneFill } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/**
 * ⚠️ **모양이 대상을 말한다** (DESIGN §6.4): 사람은 원, 프로젝트는 라운드 사각. 같은 크기의 원 둘이
 * 사이드바에 나란히 있으면 프로젝트 전환과 사용자 메뉴가 구별되지 않는다.
 */
export function Avatar({
  name,
  src,
  size = 24,
  shape = "circle",
  className,
}: {
  name: string;
  src?: string | null;
  /**
   * ⚠️ **56은 `/account` 머리 하나다** (2026-09-13). 유니온을 넓힌 것은 그 자리 때문이고,
   * **글자 크기가 `size`를 따라간다** — 56에 13px 이니셜은 점처럼 보인다.
   * ⚠️ **사진 렌더는 이 유니온과 무관하다** — `src`를 이미 받아 `<img>`를 그린다.
   */
  size?: 16 | 24 | 32 | 56;
  shape?: "circle" | "square";
  className?: string;
}) {
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded";
  // ⚠️ **테두리가 없다** (2026-09-25 사용자 — 2026-09-20의 `border border-border`를 걷었다). 사진·이니셜 두
  // 갈래가 함께 없어서 폴백이 일어나도 크기가 갈리지 않는다. 프로젝트 타일도 같은 판정이다.
  const style = { width: size, height: size };
  // 실패 기억은 `ImageTile`과 한 벌이다 (malmoi#50) — 마크업만 다르다(원형 · `object-cover` · 이니셜 폴백).
  const image = useImageFallback(src);
  if (image.shown !== null) {
    // eslint 없는 리포다 — `next/image`를 쓰지 않는 이유는 GitHub 아바타가 외부 호스트라
    // `images.remotePatterns` 설정이 따라붙기 때문이다(면적 대비 얻는 것이 없다).
    // ⚠️ 공급자 사진은 핫링크라 공급자 쪽 일시 실패·만료가 그대로 여기 온다 — Blob을 지나는 것은 업로드뿐이다.
    // ⚠️ **`ref`가 한 번 더 본다** — 하이드레이션 전에 끝난 실패는 `onError`로 안 온다(서버가 그린 `/account`).
    return <img src={image.shown} alt="" style={style} onError={image.onError} ref={image.ref}
      className={cn(shapeClass, "shrink-0 object-cover", className)} />;
  }
  return (
    <span
      style={style}
      aria-hidden
      className={cn(
        /**
         * ⚠️ **색이 이름에서 온다** (2026-09-11 사용자). 그 전엔 `bg-muted` 하나라 사람이 여럿인
         * 화면에서 아바타가 전부 같은 회색이었다 — 이니셜만으로는 훑을 때 안 갈린다.
         *
         * ⚠️ **글자가 흰색이다** — 채워진 배경 위라 `text-foreground/60`은 안 읽힌다.
         */
        "inline-flex shrink-0 items-center justify-center font-medium text-white",
        size === 56 ? "text-xl" : "text-xs",
        toneFill(name),
        shapeClass,
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
