import { ArrowDownToLine, Eye, GitPullRequestArrow, Languages } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { CARD_STATE, type CardSubline, type HomeCard } from "@/lib/home/cards";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { ALL_NAMESPACES, routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 카운트 카드 넷 (캔버스 `2a` · DESIGN §6.64).
 *
 * ⚠️ **`components/ui/`가 아니다.** 소비자가 Home 하나이고 목록 화면은 띠 형으로 이미 서 있다 —
 * 프리미티브로 올리면 "안 본 화면의 표현을 바꾸지 않는다"의 반대편으로 압력이 생긴다.
 *
 * ⚠️ **글리프·제목·색은 목록 화면과 같은 것을 쓴다** (DESIGN §6.64) — 사전 키까지 공유한다.
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
    /*
      카드 넷 사이만 8이다 — 블록 사이(20)보다 좁아야 넷이 **한 덩어리**로 읽힌다 (캔버스 `2a`).

      ⚠️ **뷰포트가 아니라 컨테이너로 접는다.** 캔버스는 칸 폭 240을 전제하고 4열을 못 박았는데,
      칸이 좁아지면 `New from GitHub`이 두 줄로 접혀 **카드마다 수치의 세로 위치가 어긋난다**
      (2026-09-15 실물, 컨테이너 531 → 칸 127). 임계값 672는 가장 긴 제목(14px) + 글리프 16 +
      gap 8 + padding 28 = 162를 네 칸 세운 값이다.

      ⚠️ **컨테이너는 콘텐츠 패널이 아니라 이 본문 grid의 왼쪽 열이다** — 패널 폭에서 **374**
      (border 2 + `p-4` 32 + 메타 열 320 + gap 20)를 뺀다. 2026-09-16에 셸 우측 프로젝트 패널을
      지워 패널이 320 + 8 넓어졌고, 그래서 **이 화면이 처음으로 4열을 밟는다** — 다만 **최소 대응 폭
      1280에서는 여전히 2열**이고(실측 패널 1016 / 컨테이너 642) 4열은 뷰포트 ~1310 위에서 시작한다
      (1502 실측 865). ⚠️ **패널 폭을 컨테이너 폭으로 바꿔 읽지 않는다** — 2026-09-16 리뷰가 그
      오판을 `shell-panels.tsx` 주석에서 잡았다.
    */
    /*
      ⚠️ **선언과 질문이 같은 요소에 있으면 안 된다** — 요소는 자기 자신의 쿼리 컨테이너가 될 수 없어
      (순환 방지) 그 변형이 **어떤 폭에서도 참이 안 된다.** 2026-09-15까지 둘이 이 `<ul>`에 같이 있어
      카드 넷이 언제나 2×2였다. `components/__tests__/container-query.test.ts`가 소스에서 센다.
    */
    <div className="@container/cards">
      <ul className="grid grid-cols-2 gap-2 @[672px]/cards:grid-cols-4">
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
                /*
                  ⚠️ **`ns`를 명시한다** (2026-09-15 Codex 리뷰 🟡1). 안 실으면 번역 화면이 `?ns=`
                  부재를 "기본 착지"로 읽어 **남은 일이 있는 첫 네임스페이스**를 고르는데, 그 판정은
                  상태를 안 본다 — `To review 12`를 눌렀는데 그 네임스페이스엔 미번역만 있어 **0건**이
                  나온다. 구간을 보러 온 사람에게 네임스페이스 좁힘은 교집합을 비우는 축이다.
                */
                href={routes.translations(slug, { ns: ALL_NAMESPACES, state: CARD_STATE[card.key] })}
                className="focus-visible:ring-ring border-border hover:bg-foreground/[0.02] flex flex-col gap-3 rounded-lg border p-3.5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.projects.summary[card.key]}</span>
                  {/*
                    ⚠️ **기본 글리프가 `neutral-400`이고 `muted-foreground`가 아니다** (캔버스 `#a3a3a3`).
                    카드 안에서 글리프는 제목의 보조이지 읽을 것이 아니라, 보조 줄(`#737373`)보다 한
                    단계 더 물러나야 넷이 나란히 섰을 때 색을 든 둘이 튀어나온다.
                  */}
                  <Glyph
                    className={cn(
                      "ml-auto size-4",
                      card.tone === "accent" ? "text-blue-600" : card.tone === "warning" ? "text-amber-700" : "text-neutral-400",
                    )}
                    aria-hidden
                  />
                </span>
                <span className="flex flex-col gap-0.5">
                  {/*
                    ⚠️ **숫자에 색을 쓰는 유일한 자리다** (DESIGN §6.2 — 이미 등재돼 있다). 넷 중
                    `New from GitHub`만 **내가 만들지 않은 변화**라 그 하나가 색을 든다.
                    ⚠️ **0이면 `neutral-400`이다** — 값을 지우지 않는 것이 규칙이고(0이 곧 정보다)
                    대신 무게를 뺀다.
                  */}
                  <span
                    className={cn(
                      "text-2xl font-medium",
                      card.muted ? "text-neutral-400" : card.tone === "accent" ? "text-blue-600" : undefined,
                    )}
                  >
                    {value(card)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {m.home.cards.unit[card.unit]} · {sublineText(card.subline, now)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * ⚠️ **유입만 `+` 접두다** (캔버스 `+12`) — 목록 화면의 띠와 같은 관용구이고, 그 칸만 **늘어난 양**을
 * 말하기 때문이다. 나머지 셋은 **남아 있는 양**이라 부호가 뜻을 바꾼다.
 *
 * ⚠️ **로케일을 고정한다** — `toLocaleString()`은 서버 로케일에 따라 구분자가 갈리고, 그러면 같은 DB
 * 상태가 다른 화면을 낸다 (export 결정성과 같은 축).
 */
function value(card: HomeCard): string {
  const formatted = card.value.toLocaleString("en-US");
  return card.key === "newFromGithub" && card.value > 0 ? `+${formatted}` : formatted;
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
    case "repositoryUpdatesPaused":
      return m.home.cards.repositoryUpdatesPaused;
  }
}
