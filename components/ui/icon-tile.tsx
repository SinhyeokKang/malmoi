import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * **아이콘 칸 — 규격이 둘뿐이다** (2026-09-28 사용자 — 28px 칸에 radius 4·8이 섞이고 빈 상태 칸이 셋이던 것을 접었다).
 *
 * - `sm` **28 · radius 4 · 글리프 16** — 행 안의 칸 전부(Account·Settings·Sources·Home 주의·Logs 행·Members 대기 초대 등)
 * - `lg` **40 · radius 8 · 글리프 20** — 새 프로젝트 모달의 후보 행 · Logs 사건 상세 머리 · `/oauth/authorize` 앱 카드 칩 · **모든 빈 상태**(`EmptyState`·`EmptyRowCard`)
 *
 * ⚠️ **글리프 크기를 칸이 정한다**(`[&_svg]:size-*`) — 호출부가 준 `size-4`보다 명시도가 높아 `lg` 안에서도 20이 된다. 그래서 규격이
 * 바뀌어도 호출부를 돌지 않는다. 국기처럼 svg가 아닌 내용물은 건드리지 않는다.
 *
 * 면·글자색 기본은 `bg-foreground/5 text-muted-foreground`이고 **정보를 싣는 색만 덮는다**(`className`) — Logs 사건 색 · 실패 빨강 ·
 * 주의 호박 · 온보딩 후보의 선택 면. 회색 칸의 글자색은 이 기본 하나다(옛 상속·`neutral-600`·muted 셋이 섞였다).
 */
const SIZE = {
  sm: "size-7 rounded [&_svg]:size-4",
  lg: "size-10 rounded-sm [&_svg]:size-5",
} as const;

export type IconTileSize = keyof typeof SIZE;

/** 나머지 속성(`data-*` 표식 등)은 칸 `<span>`에 그대로 선다. */
export function IconTile({ size = "sm", className, ...props }: ComponentProps<"span"> & { size?: IconTileSize }) {
  return <span className={cn("bg-foreground/5 text-muted-foreground flex shrink-0 items-center justify-center", SIZE[size], className)} {...props} />;
}
