"use client";

import { useState } from "react";

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
  /**
   * ⚠️ **사진과 이니셜이 같은 테두리를 쓴다** (2026-09-20 사용자) — 흰 배경에 가까운 사진은
   * 윤곽이 없으면 경계가 사라지고, 둘이 다른 테두리를 가지면 폴백이 일어난 순간 크기가 달라 보인다.
   * `box-sizing: border-box`라 `size`는 그대로고 안쪽만 1px 줄어든다.
   */
  const borderClass = "border border-border";
  const style = { width: size, height: size };
  /**
   * ⚠️ **실패를 불리언이 아니라 그 `src`로 기억한다** (malmoi#50) — 사진을 바꾸면 새 URL은 다시 시도해야
   * 하는데, 불리언이면 되돌리는 effect가 한 박자 늦어 새 사진 대신 이니셜이 먼저 선다.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    // eslint 없는 리포다 — `next/image`를 쓰지 않는 이유는 GitHub 아바타가 외부 호스트라
    // `images.remotePatterns` 설정이 따라붙기 때문이다(면적 대비 얻는 것이 없다).
    // ⚠️ 공급자 사진은 핫링크라 공급자 쪽 일시 실패·만료가 그대로 여기 온다 — Blob을 지나는 것은 업로드뿐이다.
    // ⚠️ **`ref`가 한 번 더 본다** — 하이드레이션 전에 끝난 실패는 `onError`로 안 온다(서버가 그린 `/account`).
    return <img src={src} alt="" style={style} onError={() => setFailedSrc(src)}
      ref={(img) => { if (img?.complete && img.naturalWidth === 0) setFailedSrc(src); }}
      className={cn(shapeClass, borderClass, "shrink-0 object-cover", className)} />;
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
        borderClass,
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
