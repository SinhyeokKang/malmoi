"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * **사진이 안 뜨면 폴백으로 떨어진다** (malmoi#50).
 *
 * ⚠️ **실패를 불리언이 아니라 그 `src`로 기억한다** — 사진을 바꾸면 새 URL은 다시 시도해야 하는데,
 * 불리언이면 되돌리는 effect가 한 박자 늦어 새 사진 대신 폴백이 먼저 선다.
 *
 * ⚠️ **`ref`가 한 번 더 본다** — 하이드레이션 전에 끝난 실패는 `onError`로 안 온다(서버가 그린 화면).
 * 이슈의 실측이 `complete = true`·`naturalWidth = 0`이었다.
 */
export function useImageFallback(src: string | null | undefined): {
  shown: string | null;
  onError: () => void;
  ref: (image: HTMLImageElement | null) => void;
} {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src && src !== failedSrc ? src : null;
  return {
    shown,
    onError: () => setFailedSrc(shown),
    ref: (image) => { if (image?.complete && image.naturalWidth === 0) setFailedSrc(shown); },
  };
}

/**
 * 프로젝트를 가리키는 **정사각 타일** — 이미지 한 장과 그 폴백을 같은 상자 안에서 바꾼다.
 *
 * ⚠️ **`Avatar`를 대신하지 않는다** — 그쪽은 사람이라 `object-cover`에 폴백이 이니셜 글자이고,
 * 실패 기억만 위 훅으로 공유한다. 여기 폴백은 흰 글리프다 (DESIGN §6.4가 그 대체를 이미 거부했다).
 *
 * ⚠️ **`fallbackClassName`이 폴백에만 붙는다** — `toneFill`이 이미지 뒤에 깔리면 투명 PNG의
 * 배경색이 프로젝트마다 달라진다.
 *
 * ⚠️ **`object-contain`이 이 잎에 박혀 있다 — 소비자가 못 바꾼다.** 프로젝트 이미지는 로고라 잘리면
 * 뜻이 사라진다(`avatar.tsx`의 `object-cover`와 갈리는 근거). 셋 다 같은 값이라 prop으로 열지 않는다.
 *
 * ⚠️ **서버 컴포넌트가 이것을 쓸 수 있다** — 실패 상태를 이 잎이 들어서, 소비자(`ProjectThumbnail`·
 * 초대 카드)가 `"use client"`가 되지 않는다.
 */
export function ImageTile({
  src,
  className,
  fallbackClassName,
  children,
}: {
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** 이미지가 없거나 깨졌을 때의 내용 — 흰 글리프. */
  children: ReactNode;
}) {
  const image = useImageFallback(src);
  return (
    <span aria-hidden className={cn(className, image.shown === null && fallbackClassName)}>
      {image.shown === null
        ? children
        : <img src={image.shown} alt="" className="size-full object-contain" onError={image.onError} ref={image.ref} />}
    </span>
  );
}
