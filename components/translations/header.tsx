"use client";

import { type ReactNode, useId, useRef } from "react";

import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { TranslationFilters } from "@/components/translations/filters";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import type { TranslationsQuery } from "@/lib/routes";

/** 무조건 렌더되는 헤더가 Publish 상태를 소유해 refresh·빈 목록 뒤에도 결과를 보존한다. */
export function TranslationsHeader({
  slug,
  surfaceSlug,
  surfaces,
  totalCount,
  query,
  chipQuery,
  namespaces,
  locales,
  selected,
  fallback,
  unpublished,
  repo,
  role,
  lastSentLabel,
  lastPrUrl,
  baseLocale,
  declaredBaseLocale,
  children,
}: {
  slug: string;
  surfaceSlug: string;
  surfaces: readonly import("@/components/surface-selector").SurfaceOption[];
  /**
   * ⚠️ **필터 전의 총계다** (`/projects` 목록과 같은 규칙). 필터를 걸 때마다 흔들리면 "이
   * 프로젝트에 키가 몇 개인가"에 답하지 못한다 — 필터 후 건수는 섹션 헤딩의 배지가 든다.
   */
  totalCount: number;
  query: TranslationsQuery;
  /**
   * 칩이 보는 쿼리 — `query`와 **`ns` 하나만 다르다**(기본 착지면 비어 있다). 화면이 정한 착지를
   * 칩으로 세우면 아무것도 안 누른 사용자에게 필터가 걸린 것처럼 보인다.
   */
  chipQuery: TranslationsQuery;
  namespaces: readonly { namespace: string; pending: number; total: number }[];
  locales: readonly { code: string; orphaned: boolean }[];
  selected: readonly string[];
  fallback: readonly string[];
  /** 아직 안 보낸 편집 수 — 배너와 버튼 라벨이 같은 값을 쓴다 (DESIGN §6.1). */
  unpublished: number;
  /** ⚠️ **서버가 만든다** — `syncBranch`의 규칙이 사는 모듈은 클라이언트가 물면 안 된다(번들 7.2MB). */
  repo: { owner: string; name: string; branch: string; syncBranch: string };
  /** `1h`의 복구 버튼이 이것을 탄다 — EDITOR는 설정 화면에 못 들어간다. */
  role: "OWNER" | "EDITOR";
  /** ⚠️ 서버가 만든 상대 시각이다 — 클라이언트가 다시 계산하면 하이드레이션이 갈린다. */
  lastSentLabel: string | null;
  lastPrUrl: string | null;
  /** 기준 로케일의 **현실**과 **선언** — 대기 배너의 조건이다 (6b-3, `basePending`). */
  baseLocale: string | null;
  declaredBaseLocale: string | null;
  children: ReactNode;
}) {
  const publish = usePublish(slug);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const publishButtonId = useId();

  return (
    <>
      {/*
        ⚠️ **여백·폭 등급·아래 선을 `PanelHeader`가 든다** (2026-09-15 — projects-panel-rework).
        전에는 이 화면이 `px-6 pt-6 pb-3`을 직접 넘겼고 라우트 아홉이 같은 값을 각자 적었다.
        같은 셸 안의 두 화면이 다른 여백을 들면 라우트를 옮길 때 머리가 튄다 — 그것을 이제 구조가 막는다.
      */}
      <PanelHeader width="fluid">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            화면 제목이 사이드바 라벨과 **같은 키**다 (8-3) — 두 벌이면 하나가 낡는다.

            ⚠️ **`text-lg`(18)이고 20이 아니다** (2026-09-15 — 캔버스 `Projects v2`). 20은 카드 헤더
            15와 5px 차라 위계가 과했다. **라우트 아홉이 같은 급이어야 하고**, 갈리면 어느 쪽이 페이지
            제목인지가 화면마다 달라진다. letter-spacing은 `--text-lg--letter-spacing`이 든다.
          */}
          <h1 ref={titleRef} tabIndex={-1} className="text-lg font-medium">{m.common.nav.translations}</h1>
          {/*
            ⚠️ **숫자만 그리면 접근 이름이 "Translations 1134"다.** 시안이 숫자 배지라 보이는 것은
            그대로 두고, 스크린리더에는 완전한 문장을 준다.
          */}
          <Badge variant="neutral">
            <span aria-hidden>{totalCount}</span>
            <span className="sr-only">{m.translations.keys(totalCount)}</span>
          </Badge>
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
                    className="text-blue-600"
                  >
                    {m.translations.publish.viewLink}
                  </a>
                </>
              )}
            </span>
          )}

          <div className="ml-auto">
            <PublishButton id={publishButtonId} count={unpublished} publish={publish} />
          </div>
        </div>

        <TranslationFilters
          slug={slug}
          surfaceSlug={surfaceSlug}
          surfaces={surfaces}
          query={query}
          chipQuery={chipQuery}
          namespaces={namespaces}
          locales={locales}
          selected={selected}
          fallback={fallback}
        />
      </PanelHeader>

      {/*
        ⚠️ **`flex flex-col`이 빈 상태를 패널 세로 중앙에 세우는 장치다** (2026-09-11 —
        `ProjectArchived`·`ProjectNotReady`가 같은 형이다. ⚠️ **`/projects`는 2026-09-15에 이 형에서
        빠졌다** — 그쪽 빈 상태는 카드가 되어 본문 맨 위에 붙는다). 래퍼가 `min-h-full`을 들고 있으므로(`content-panel.tsx`) 이 열이 패널 높이를 받고,
        그 안의 빈 상태가 `flex-1`로 남은 높이를 먹는다. 표가 올 때는 아무 일도 안 한다 — 표는
        `flex-1`이 아니라 자연 높이다.
      */}
      <PublishModal slug={slug} publish={publish} fallbackFocusRef={titleRef} count={unpublished} repo={repo} role={role} />
      <PanelBody width="fluid" className="flex flex-col">
        {/*
          배너는 본문에, Publish 결과는 위의 모달에 둔다.
          ⚠️ **조건부 분기 밖의 고정 슬롯이다** (DESIGN §6.1) — 안에 두면 `router.refresh()`가
          방금 만든 상태를 언마운트한다 (POSTMORTEM 2026-09-07).
          기준 로케일 대기가 **먼저**다: 편집 손실 배너는 "보내라"이고 이쪽은 "왜 지금 보내야 하는가"라
          순서를 뒤집으면 이유가 결론 뒤에 온다.
        */}
        <div className="mb-4 empty:mb-0 space-y-3">
          <BasePendingBanner baseLocale={baseLocale} declaredBaseLocale={declaredBaseLocale} />
          <EditLossBanner count={unpublished} publishButtonId={publishButtonId} />

        </div>
        {children}
      </PanelBody>
    </>
  );
}
