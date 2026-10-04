/**
 * Meter의 막대만 — 목록 행과 Sources 상세 언어 행이 같이 쓴다(5-Y18 — 상세가 값이 같은 사본을 들고 있었다).
 * 폭은 퍼센트(0–100)이고 두 구간이 겹치지 않게 호출부가 접는다. `dimmed`는 사라진 언어다 — 완료가 흐려지고 검토 구간은 호출부가 0으로 준다.
 */
export function Meter({ done, review, dimmed = false }: { done: number; review: number; dimmed?: boolean }) {
  return (
    <span aria-hidden className="bg-foreground/[0.08] flex h-1 overflow-hidden rounded-full">
      <span className={dimmed ? "bg-foreground/25 h-1" : "bg-foreground/85 h-1"} style={{ width: `${done}%` }} />
      <span className="bg-warning-emphasis h-1" style={{ width: `${review}%` }} />
    </span>
  );
}
