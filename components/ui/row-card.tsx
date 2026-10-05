import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 행 아래 띠 — **다음 한 수** 또는 **막힌 사유** (시안 `1c` · DESIGN §6.65).
 *
 * ⚠️ **행의 형제이고 `<a>` 안이 아니다** — 링크를 중첩할 수 없다. `/projects`에서는 `<li>` 안의
 * 둘째 블록이고, 멤버 행에서도 같은 자리다.
 *
 * ⚠️ **들여쓰기가 행 글리프 폭 + gap과 맞물린다** — 띠 텍스트가 행의 1행 텍스트와 같은 x에서 시작해야
 * 그 행에 속한 것으로 읽힌다. 값이 둘인 이유와 각각의 계산은 아래 `indent` prop이 든다.
 *
 * ⚠️ **13px은 `text-xs`다** — 이 리포는 `--text-xs: 13px`이고 `text-[13px]`은 전수 0건이다 (DESIGN §4.1).
 */
export function BannerLine({
  id,
  icon,
  children,
  action,
  tone = "muted",
  indent = "row",
}: {
  /** `aria-describedby`의 대상. 꺼진 컨트롤이 이 띠를 가리킨다 (멤버 화면). */
  id?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /**
   * ⚠️ **사유에 따라 글자색이 갈린다** (캔버스 `1c` ↔ `1d`). 막힌 동작을 설명하는 띠는
   * `danger`(마지막 오너)이고, 상태를 설명하는 띠는 `muted`(못 읽음 · `/projects`의 다음 한 수)다 —
   * 둘을 같은 색으로 두면 "지금 막혀 있다"와 "이런 상태다"가 한 화면에서 구별되지 않는다.
   *
   * ⚠️ **`danger`의 소비자가 2026-09-20에 0이 됐다** — 멤버 카드의 마지막 오너 띠가 `muted`로
   * 내려갔다(사용자: *"alert 계열 말고 그냥 일반 계열"* — 오너가 하나면 상시로 서는 문장이라
   * 붉기가 사후 `Alert`의 무게를 깎는다, DESIGN §6.65). 지우지 않은 것은 판단이 아직 열려 있어서다.
   */
  /** ⚠️ **2026-09-30 — 상태 띠의 색은 그 상태의 색이다**(사용자 — 같은 실패가 화면마다 회색·빨강·노랑이었다): 실패 `danger` · 재연결 필요 `warning` · 그 밖 `muted`. */
  tone?: "muted" | "warning" | "danger";
  /**
   * 텍스트 시작 x. 행의 글리프 폭이 화면마다 달라 값이 둘이다 —
   * `row` 56(`/projects` 썸네일 28 + gap 16 + padding 12) · `avatar` 60(멤버 아바타 32 + 16 + 12).
   * ⚠️ **띠 텍스트가 행 1행 텍스트와 같은 x에서 시작해야** 그 행에 속한 것으로 읽힌다.
   */
  indent?: "row" | "avatar";
}) {
  return (
    <div
      id={id}
      data-tone={tone}
      className={cn(
        "border-foreground/[0.06] bg-foreground/[0.02] flex items-center gap-2 border-t py-2 pr-3.5 text-xs",
        indent === "avatar" ? "pl-15" : "pl-14",
        tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning-soft-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </div>
  );
}
