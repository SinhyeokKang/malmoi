import { ArrowDownToLine, Eye, GitPullRequestArrow, Languages } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { CARD_STATE, type CardSubline, type HomeCard } from "@/lib/home/cards";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 카운트 카드 넷 (캔버스 `2a` · project-home design §5.1).
 *
 * ⚠️ **`components/ui/`가 아니다.** 소비자가 Home 하나이고 목록 화면은 띠 형으로 이미 서 있다 —
 * 프리미티브로 올리면 "안 본 화면의 표현을 바꾸지 않는다"의 반대편으로 압력이 생긴다.
 *
 * ⚠️ **글리프·제목·색은 목록 화면과 같은 것을 쓴다** (design §2) — 사전 키까지 공유한다.
 */

/** 순서가 파이프라인이다. 목록 화면(`project-list.tsx`)과 **같은 넷, 같은 순서**다. */
const GLYPH: Record<HomeCard["key"], ComponentType<{ className?: string }>> = {
  newFromGithub: ArrowDownToLine,
  toTranslate: Languages,
  toReview: Eye,
  toSend: GitPullRequestArrow,
};

export function CountCards({ cards, slug, now }: { cards: readonly HomeCard[]; slug: string; now: Date }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Glyph = GLYPH[card.key];
        return (
          <li key={card.key}>
            {/*
              ⚠️ **카드 전체가 링크다** — 수만 말하고 갈 곳이 없으면 개요가 일로 이어지지 않는다
              (PRODUCT §7.7 결정 1의 대가). 접근 이름은 제목 + 수치 + 보조 줄의 name-from-content로
              선다: 안쪽에 버튼을 넣지 않는 것이 그 조건이다.
            */}
            <Link
              href={routes.translations(slug, { state: CARD_STATE[card.key] })}
              className="focus-visible:ring-ring border-border hover:bg-foreground/[0.02] flex flex-col gap-3 rounded-xl border p-3.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.projects.summary[card.key]}</span>
                {/*
                  ⚠️ **0이면 글리프도 함께 흐려진다** (design §5.2) — 목록 화면은 라벨이 이미 muted라
                  글리프가 그 색을 상속하지만, 카드는 수치가 크고 기본색이 짙어 규칙이 새로 필요하다.
                */}
                <Glyph
                  className={cn(
                    "ml-auto size-4",
                    card.tone === "accent" ? "text-blue-600" : card.tone === "warning" ? "text-amber-700" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-2xl font-medium", card.muted && "text-muted-foreground")}>{card.value}</span>
                <span className="text-muted-foreground text-xs">
                  {m.home.cards.unit[card.unit]} · {sublineText(card.subline, now)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 문장은 사전이 소유한다 — 판정(`countCards`)은 갈래와 재료만 낸다. */
function sublineText(subline: CardSubline, now: Date): string {
  const when = (at: Date | null): string | null => (at === null ? null : relativeTime(at, now));
  switch (subline.kind) {
    case "synced":
      return m.home.cards.synced(when(subline.at));
    case "acrossSurfaces":
      return m.home.cards.acrossSurfaces(subline.surfaces);
    case "reviewByLocale":
      // 폭에 따라 뒤부터 잘리므로 큰 수가 앞이다 — 정렬은 `reviewByLocale`이 이미 했다.
      return m.home.cards.reviewByLocale(subline.locales.map((l) => m.home.cards.localeCount(l.code, l.count)).join(", "));
    case "lastPublish":
      return m.home.cards.lastPublish(relativeTime(subline.at, now));
    case "allFilled":
      return m.home.cards.allFilled(subline.keys);
    case "nothingPending":
      return m.home.cards.nothingPending;
    case "lastGoodSync":
      return m.home.cards.lastGoodSync(when(subline.at));
    case "asOf":
      return m.home.cards.asOf(when(subline.at));
    case "asOfLastSync":
      return m.home.cards.asOfLastSync;
    case "pausedCannotSend":
      return m.home.cards.cannotSend;
    case "frozenAtArchive":
      return m.home.cards.frozen;
    case "neverSent":
      return m.home.cards.neverSent;
  }
}
