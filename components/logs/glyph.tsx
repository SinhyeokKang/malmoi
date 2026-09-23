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

import type { GlyphIcon, GlyphTone } from "@/lib/events/view";
import { cn } from "@/lib/utils";

/**
 * 이벤트 글리프 칩 28 · 상세 40 (캔버스 `1a` — 연한 면 + 진한 아이콘).
 *
 * ⚠️ **색이 보조다.** 결과는 결과 열의 낱말이, 종류는 문장이 말한다 — 칩만으로 성립하는 정보는
 * 싣지 않았다. 그래서 `aria-hidden`이다.
 *
 * ⚠️ **팔레트 클래스를 쓰고 임의 hex를 쓰지 않는다** (DESIGN §6.2). 시안의 여덟 쌍이 Tailwind
 * 기본 팔레트와 정확히 같은 값이라 새 raw 색을 늘리지 않고 그대로 선다 — 등재는 DESIGN §6.2다.
 */
const TONE: Readonly<Record<GlyphTone, string>> = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700",
  teal: "bg-teal-50 text-teal-700",
  purple: "bg-violet-50 text-violet-700",
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
 * ⚠️ **`lg`(40)는 상세 머리 전용이다** — 목록 행은 28이다. 40은 온보딩 ①②의 글리프 칩과 같은
 * 규격이라 글리프 20 · radius 10(`rounded-md`)도 그쪽을 따른다 (DESIGN §5.1 · §6.7).
 */
const SIZE = {
  sm: { chip: "size-7 rounded-sm", icon: "size-4" },
  lg: { chip: "size-10 rounded-md", icon: "size-5" },
} as const;

export function EventGlyph({ icon, tone, size = "sm", className }: { icon: GlyphIcon; tone: GlyphTone; size?: keyof typeof SIZE; className?: string }) {
  const Icon = ICON[icon];
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center", SIZE[size].chip, TONE[tone], className)}
    >
      <Icon className={cn("shrink-0", SIZE[size].icon)} />
    </span>
  );
}
