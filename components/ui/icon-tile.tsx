import type { ComponentProps } from "react";

import type { StateTone } from "@/lib/status/canon";
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
 * **상태 칸의 색은 `tone`이 든다** (DESIGN §2.4 아이콘 칸 열 · 2026-10-01 ux-drift-unify) — 성공 초록 · 경고 호박 · 실패 빨강 · 그 밖 회색.
 * 호출부가 색 문자열을 고르면 같은 실패가 화면마다 다른 칸이 됐다(Logs 칩 emerald · Sources green · Home 호박 실패). `className`은
 * **상태가 아닌 면**만 덮는다 — Logs 종류 색(파랑·청록·보라) · 온보딩 후보의 선택 면·`bg-muted`. 회색 칸의 글자색은 기본 하나다.
 */
const TONE: Readonly<Record<StateTone, string>> = {
  success: "bg-success-soft text-success-foreground",
  muted: "bg-foreground/5 text-muted-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive/8 text-destructive",
};

const SIZE = {
  sm: "size-7 rounded [&_svg]:size-4",
  lg: "size-10 rounded-sm [&_svg]:size-5",
} as const;

export type IconTileSize = keyof typeof SIZE;

/** 나머지 속성(`data-*` 표식 등)은 칸 `<span>`에 그대로 선다. */
/**
 * `data-tone`은 **상태 칸일 때만**(호출부가 `tone`을 줬을 때) 선다 — 화면 테스트가 클래스 문자열이 아니라 상태 톤으로 단언한다.
 * 종류 색(Logs 파랑·청록·보라)처럼 `className`이 면을 든 칸에는 없다. 호출부가 `data-tone`을 직접 넘기면 그것이 이긴다.
 */
export function IconTile({ size = "sm", tone, className, ...props }: ComponentProps<"span"> & { size?: IconTileSize; tone?: StateTone }) {
  return <span data-tone={tone} className={cn("flex shrink-0 items-center justify-center", TONE[tone ?? "muted"], SIZE[size], className)} {...props} />;
}
