"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PublishButton, PublishResult } from "@/components/publish-button";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { FilterChips } from "@/components/translations/filter-chips";
import { TranslationFilters } from "@/components/translations/filters";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import type { PullOutcome } from "@/lib/pull/message";
import type { TranslationsQuery } from "@/lib/routes";

/**
 * 번역 화면의 머리 + 본문 껍데기 — 제목 · Publish · 툴바 · 칩 행 · 배너 둘 · 결과 `Alert` (8-4).
 *
 * ⚠️ **왜 이것 전체가 클라이언트인가**: Publish 결과 `Alert`는 칩 행 **아래**인데 그 상태를 만드는
 * 버튼은 제목 행 **오른쪽**이다. 두 자리를 한 상태 트리가 들어야 하고, 그 트리는
 * `router.refresh()`가 바꾸는 조건부 분기 **밖**에 있어야 한다 — 분기 안에 두면 성공이 자기 결과를
 * 언마운트한다 (POSTMORTEM 2026-09-07). 페이지는 이 컴포넌트를 무조건 렌더한다.
 *
 * ⚠️ **`revalidatePath`도 같은 축이다** — 셀 저장(`saveTranslation`)이 이 페이지를 revalidate하므로,
 * 결과 Alert가 저장 한 번에 사라지지 않으려면 자리가 고정이어야 한다.
 *
 * ⚠️ **표를 `children`으로 받는다.** 배너 둘과 결과 `Alert`는 **스크롤 영역 안**이어야 한다 —
 * 셋이 동시에 서면 400px을 넘어 1008 뷰포트의 40%를 고정으로 먹는다. 무조건 렌더와 "고정 영역인가"는
 * **별개 축**이고, 스크롤 영역 안에 두어도 언마운트되지 않으므로 위 조건은 그대로 지켜진다.
 *
 * ⚠️ **breadcrumb이 없다** (8-4 spec Q5) — 프로젝트 하위 화면 다섯에서 함께 지웠다. 위로 가는 길은
 * 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다).
 *
 * ⚠️ **8-P가 Publish 버튼과 결과 `Alert`를 오른쪽 프로젝트 패널로 가져간다** (SAAS §8). 그때
 * 떼어낼 것은 이 파일의 슬롯 배선 하나다 — 그 전에 패널에 하나 더 만들면 둘 중 하나가 낡는다.
 */
export function TranslationsHeader({
  slug,
  totalCount,
  query,
  namespaces,
  locales,
  selected,
  fallback,
  unpublished,
  lastSentLabel,
  lastPrUrl,
  dismissKey,
  baseLocale,
  declaredBaseLocale,
  children,
}: {
  slug: string;
  /**
   * ⚠️ **필터 전의 총계다** (`/projects` 목록과 같은 규칙). 필터를 걸 때마다 흔들리면 "이
   * 프로젝트에 키가 몇 개인가"에 답하지 못한다 — 필터 후 건수는 섹션 헤딩의 배지가 든다.
   */
  totalCount: number;
  query: TranslationsQuery;
  namespaces: readonly { namespace: string; pending: number; total: number }[];
  locales: readonly { code: string; orphaned: boolean }[];
  selected: readonly string[];
  fallback: readonly string[];
  /** 아직 안 보낸 편집 수 — 배너와 버튼 라벨이 같은 값을 쓴다 (design §3.5). */
  unpublished: number;
  /** ⚠️ 서버가 만든 상대 시각이다 — 클라이언트가 다시 계산하면 하이드레이션이 갈린다. */
  lastSentLabel: string | null;
  lastPrUrl: string | null;
  /** 배너 닫기 키 = `lastPulledAt` (design §3.11). */
  dismissKey: string;
  /** 기준 로케일의 **현실**과 **선언** — 대기 배너의 조건이다 (6b-3, `basePending`). */
  baseLocale: string | null;
  declaredBaseLocale: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<PullOutcome | null>(null);

  return (
    <>
      <PanelHeader className="space-y-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* 화면 제목이 사이드바 라벨과 **같은 키**다 (8-3) — 두 벌이면 하나가 낡는다. */}
          <h1 className="text-base font-medium">{m.common.nav.translations}</h1>
          <Badge variant="neutral">{totalCount}</Badge>
          {lastSentLabel !== null && (
            <span className="text-muted-foreground text-xs">
              {m.translations.lastSent(lastSentLabel)}
              {lastPrUrl !== null && (
                <>
                  {" · "}
                  <a
                    href={lastPrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-baseline gap-1 text-blue-600"
                  >
                    {m.translations.publish.viewLink}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </>
              )}
            </span>
          )}

          <div className="ml-auto">
            <PublishButton
              slug={slug}
              count={unpublished}
              onResult={(next) => {
                setOutcome(next);
                /**
                 * 툴바의 "Last sent"와 미배포 건수는 서버가 만든다 — 결과 Alert는 같은 자리에 남는다.
                 *
                 * ⚠️ **실패에는 갱신하지 않는다** (2026-09-08 실물 검증). 서버 상태가 안 바뀌었으니
                 * 갱신할 것이 없고, 사유가 `unauthorized`면 그 refresh가 미들웨어에 걸려 로그인
                 * 화면으로 **네비게이션**한다 — 방금 만든 danger Alert가 사용자에게 한 프레임도
                 * 닿지 않는다. POSTMORTEM 2026-09-07과 같은 축의 실패다.
                 */
                if (next.status !== "failed") router.refresh();
              }}
            />
          </div>
        </div>

        <TranslationFilters
          slug={slug}
          query={query}
          namespaces={namespaces}
          locales={locales}
          selected={selected}
          fallback={fallback}
        />
        <FilterChips slug={slug} query={query} selected={selected} fallback={fallback} />
      </PanelHeader>

      <PanelBody className="px-6 py-4">
        {/*
          배너가 위, 결과가 아래다 (design §3.11) — 결과는 방금 누른 것에 대한 답이라 더 가까이 둔다.
          ⚠️ **셋 다 조건부 분기 밖의 고정 슬롯이다** (DESIGN §6.1) — 안에 두면 `router.refresh()`가
          방금 만든 상태를 언마운트한다 (POSTMORTEM 2026-09-07).
          기준 로케일 대기가 **먼저**다: 편집 손실 배너는 "보내라"이고 이쪽은 "왜 지금 보내야 하는가"라
          순서를 뒤집으면 이유가 결론 뒤에 온다.
        */}
        <div className="mb-4 empty:mb-0 space-y-3">
          <BasePendingBanner baseLocale={baseLocale} declaredBaseLocale={declaredBaseLocale} />
          <EditLossBanner count={unpublished} dismissKey={dismissKey} />
          {outcome !== null && <PublishResult outcome={outcome} />}
        </div>
        {children}
      </PanelBody>
    </>
  );
}
