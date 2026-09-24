import { cn } from "@/lib/utils";

/**
 * 로딩 자리를 채우는 회색 블록 하나 (DESIGN §6.x — new-project-modal T7).
 *
 * 지금까지는 `app/(edit)/projects/(list)/loading.tsx`의 로컬 `Block` 하나뿐이었다. 모달이 단계마다 스켈레톤을
 * 세우면서 소비자가 넷이 되므로 프리미티브로 올린다.
 *
 * ⚠️ **색은 `bg-foreground/5`다** — `EmptyState`의 아이콘 칩과 **같은 값**이고 새 raw 색이 아니다.
 * 핸드오프의 `rgba(10,10,10,0.07)`을 따로 만들면 회색 블록 값이 두 벌로 갈린다(DESIGN §6.2의 절차).
 *
 * ⚠️ **`motion-safe:`가 붙는다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다 (로그인
 * 화면의 점 필드와 같은 판정).
 *
 * ⚠️ **`aria-hidden`이 여기 있다.** 호출부가 감싸는 컨테이너마다 붙이면 하나가 빠지고, 그 순간
 * 스크린리더가 회색 블록을 읽는다 (`projects/(list)/loading.tsx`에서 실제로 둘로 갈렸다).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-foreground/5 motion-safe:animate-pulse rounded", className)} />;
}

/**
 * 글자 한 줄의 자리 (audit-ux #5 — 형제 화면 골격).
 *
 * ⚠️ **줄 높이를 px로 적지 않는다** — `text`(그 줄의 글자 크기 클래스)와 **보이지 않는 글자 하나**(U+200B)가 실물과
 * 같은 line box를 세운다. `h-[22.5px]`처럼 적으면 `--text-*` 토큰이 바뀔 때 골격만 떠내려간다(POSTMORTEM 2026-09-16의
 * "골격이 실물과 따로 떠내려갔다"). 블록 높이는 글자 크기의 비율이라 같은 이유로 `em`이다.
 */
export function SkeletonLine({ text, className }: { text: "text-xs" | "text-sm" | "text-base" | "text-lg"; className?: string }) {
  return (
    // `div`다 — 안의 `Skeleton`이 `div`라 `span`으로 감싸면 잘못된 중첩이다.
    <div data-skeleton-line className={cn("flex min-w-0 items-center", text)}>
      {"\u200b"}
      <Skeleton className={cn("h-[0.8em] rounded-md", className)} />
    </div>
  );
}
