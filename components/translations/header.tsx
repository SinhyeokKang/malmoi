"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { InviteForm } from "@/components/invite-form";
import { PublishButton, PublishResult } from "@/components/publish-button";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { TranslationFilters } from "@/components/translations/filters";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { m } from "@/lib/i18n";
import type { PullOutcome } from "@/lib/pull/message";
import { routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 번역 화면의 헤더 스트립 — breadcrumb · 제목 · 툴바 · 편집 손실 배너 · Publish 결과.
 *
 * ⚠️ **왜 이것 전체가 클라이언트인가**: Publish 결과 `Alert`는 툴바 **아래**(배너 밑) 고정 자리인데
 * 그 상태를 만드는 버튼은 툴바 **오른쪽**이다. 두 자리를 한 상태 트리가 들어야 하고, 그 트리는
 * `router.refresh()`가 바꾸는 조건부 분기 **밖**에 있어야 한다 — 분기 안에 두면 성공이 자기 결과를
 * 언마운트한다 (POSTMORTEM 2026-09-07). 페이지는 이 컴포넌트를 무조건 렌더한다.
 *
 * ⚠️ **`revalidatePath`도 같은 축이다** — 셀 저장(`saveTranslation`)이 이 페이지를 revalidate하므로,
 * 결과 Alert가 저장 한 번에 사라지지 않으려면 자리가 고정이어야 한다.
 */
export function TranslationsHeader({
  slug,
  projectName,
  namespaceLabel,
  visibleCount,
  locales,
  query,
  unpublished,
  lastSentLabel,
  lastPrUrl,
  dismissKey,
  canInvite,
}: {
  slug: string;
  projectName: string;
  /** 지금 보고 있는 네임스페이스의 라벨("All keys" 또는 이름). */
  namespaceLabel: string;
  visibleCount: number;
  locales: readonly string[];
  query: TranslationsQuery;
  /** 아직 안 보낸 편집 수 — 배너와 버튼 라벨이 같은 값을 쓴다 (design §3.5). */
  unpublished: number;
  /** ⚠️ 서버가 만든 상대 시각이다 — 클라이언트가 다시 계산하면 하이드레이션이 갈린다. */
  lastSentLabel: string | null;
  lastPrUrl: string | null;
  /** 배너 닫기 키 = `lastPulledAt` (design §3.11). */
  dismissKey: string;
  /** OWNER만 초대할 수 있다. **화면에서 감추는 것은 편의**이고 방어는 `createInvitation`이다. */
  canInvite: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<PullOutcome | null>(null);

  return (
    <div className="border-border space-y-3 border-b px-6 py-4">
      <Breadcrumb
        items={[
          { label: projectName, href: routes.translations(slug) },
          { label: m.translations.title },
        ]}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-base font-medium">{namespaceLabel}</h1>
        <span className="text-muted-foreground text-xs">{m.translations.keys(visibleCount)}</span>
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
                  className="inline-flex items-baseline gap-1 text-blue-600 underline"
                >
                  {m.translations.publish.viewLink}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            )}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <TranslationFilters slug={slug} query={query} locales={locales} />
          {canInvite && <InviteForm slug={slug} />}
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

      {/* 배너가 위, 결과가 아래다 (design §3.11) — 결과는 방금 누른 것에 대한 답이라 더 가까이 둔다. */}
      <EditLossBanner count={unpublished} dismissKey={dismissKey} />
      {outcome !== null && <PublishResult outcome={outcome} />}
    </div>
  );
}
