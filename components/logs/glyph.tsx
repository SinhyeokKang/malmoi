import {
  Archive,
  ArrowDownToLine,
  FileJson2,
  GitBranch,
  GitPullRequestArrow,
  Globe,
  KeyRound,
  Languages,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { IconTile, type IconTileSize } from "@/components/ui/icon-tile";
import type { GlyphIcon, GlyphTone } from "@/lib/events/view";
import type { StateTone } from "@/lib/status/canon";
import { cn } from "@/lib/utils";

/**
 * 이벤트 글리프 칩 28 · 상세 40 (캔버스 `1a` — 연한 면 + 진한 아이콘).
 *
 * ⚠️ **색이 보조다.** 결과는 결과 열의 낱말이, 종류는 문장이 말한다 — 칩만으로 성립하는 정보는
 * 싣지 않았다. 그래서 `aria-hidden`이다.
 *
 * ⚠️ **결과 색은 §2.4 아이콘 칸이다** (D3③ · 2026-10-01 ux-drift-unify) — 초록·호박·빨강·회색은 `IconTile tone`이 들고 이 파일은
 * 색 문자열을 들지 않는다(옛 emerald·amber-50·slate 칸은 같은 상태가 Sources·Home 칸과 갈렸다). Logs 성공이 회색인 것은
 * `logsResultTone`이 정한다. **별도 축은 종류 색 셋(파랑·청록·보라)뿐**이고 그것만 여기서 덮는다 — 설정 종류의 slate도 회색 칸이다.
 */
const TONE: Readonly<Record<GlyphTone, { tone: StateTone } | { className: string }>> = {
  green: { tone: "success" },
  amber: { tone: "warning" },
  red: { tone: "danger" },
  slate: { tone: "muted" },
  blue: { className: "bg-blue-50 text-blue-700" },
  teal: { className: "bg-teal-50 text-teal-700" },
  purple: { className: "bg-violet-50 text-violet-700" },
};

/** ⚠️ **`Record`라 아이콘 이름이 늘면 여기서 컴파일이 걸린다** — 조용히 빈 칸이 되지 않는다. */
const ICON: Readonly<Record<GlyphIcon, LucideIcon>> = {
  languages: Languages,
  "arrow-down-to-line": ArrowDownToLine,
  "git-pull-request-arrow": GitPullRequestArrow,
  "file-json-2": FileJson2,
  globe: Globe,
  users: Users,
  "git-branch": GitBranch,
  "key-round": KeyRound,
  archive: Archive,
  settings: Settings,
};

/**
 * ⚠️ **`lg`(40)는 상세 머리 전용이다** — 목록 행은 `sm`(28)이다. 규격 둘은 `IconTile`이 든다(2026-09-28 사용자 — 옛 목록 칸 radius 8 ·
 * 상세 칸 radius 10을 앱 공통 28/4/16 · 40/8/20으로 접었다). 여기서 더하는 것은 사건 색(`TONE`)뿐이다.
 */
export function EventGlyph({ icon, tone, size = "sm", className }: { icon: GlyphIcon; tone: GlyphTone; size?: IconTileSize; className?: string }) {
  const Icon = ICON[icon];
  const face = TONE[tone];
  return (
    <IconTile aria-hidden size={size} tone={"tone" in face ? face.tone : undefined} className={cn("className" in face && face.className, className)}>
      <Icon />
    </IconTile>
  );
}
