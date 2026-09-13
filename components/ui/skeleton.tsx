import { cn } from "@/lib/utils";

/**
 * 로딩 자리를 채우는 회색 블록 하나 (DESIGN §6.x — new-project-modal T7).
 *
 * 지금까지는 `app/(edit)/projects/loading.tsx`의 로컬 `Block` 하나뿐이었다. 모달이 단계마다 스켈레톤을
 * 세우면서 소비자가 넷이 되므로 프리미티브로 올린다.
 *
 * ⚠️ **색은 `bg-foreground/5`다** — `EmptyState`의 아이콘 칩과 **같은 값**이고 새 raw 색이 아니다.
 * 핸드오프의 `rgba(10,10,10,0.07)`을 따로 만들면 회색 블록 값이 두 벌로 갈린다(DESIGN §6.2의 절차).
 *
 * ⚠️ **`motion-safe:`가 붙는다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다 (로그인
 * 화면의 점 필드와 같은 판정).
 *
 * ⚠️ **`aria-hidden`이 여기 있다.** 호출부가 감싸는 컨테이너마다 붙이면 하나가 빠지고, 그 순간
 * 스크린리더가 회색 블록을 읽는다 (`projects/loading.tsx`에서 실제로 둘로 갈렸다).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-foreground/5 motion-safe:animate-pulse rounded", className)} />;
}
