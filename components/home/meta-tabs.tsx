"use client";

import { createContext, useContext, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArrived } from "@/components/use-arrived";
import type { HomeLate, PrStateValue } from "@/lib/home/meta";

/**
 * Home 메타 열의 **탭 껍데기** (project-card-tabs §3·§4) — 탭 선택과 늦게 오는 값의 구독만 든다. 패널 내용·라벨·바닥 링크는 서버가 렌더해 넘긴다.
 *
 * ⚠️ **늦게 오는 값(Hold · PR state)은 여기서 한 번 구독한다** — Radix는 비활성 패널의 자식을 언마운트하고, `useArrived`는 `null`에서 시작해
 * effect로 값을 받는다. 패널 안에서 구독하면 탭을 갔다 올 때마다 한 프레임 비운 채 그린다. 껍데기는 늘 마운트돼 있으므로 값을 컨텍스트로
 * 내리고, 패널 속 자리(`LateHold`·`LatePrState`)는 읽기만 한다. `forceMount`를 쓰지 않는다.
 *
 * ⚠️ **`lib/**` 값 import가 없다** — 타입만 가져온다(POSTMORTEM 2026-09-07 · `client-graph.test.ts`).
 */
const LateContext = createContext<HomeLate | undefined>(undefined);

export type MetaTabPanel = { value: string; label: string; panel: ReactNode };

export function MetaTabs({ label, tabs, late, identity }: {
  /** 탭 목록 이름 — 첫 탭과 랜드마크가 같은 `Project`라 "무엇의 탭인가"를 말한다. */
  label: string;
  tabs: readonly MetaTabPanel[];
  /** PR 조회가 도는 갈래에서만 온다(`planHomeHold`가 promise를 낼 때). 거부하지 않는다 — 페이지가 조회 실패를 `pr-check-failed`로 접었다. */
  late?: Promise<HomeLate>;
  /** 그 값이 속한 프로젝트(slug) — 바뀌면 옛 프로젝트의 값을 곧바로 버린다(`useArrived`). */
  identity: string;
}) {
  const arrived = useArrived(late, identity);
  const first = tabs[0]?.value ?? "";
  return (
    <Tabs defaultValue={first}>
      {/* 머리 padding 12 · 높이 60(트랙 36) — 카드 머리 대신 탭 목록이 머리다. 아래 선은 머리가 긋는다. 골격이 이 클래스를 그대로 쓴다. */}
      <div data-meta-head className="border-divider border-b p-3">
        <TabsList label={label}>
          {tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} label={tab.label} />)}
        </TabsList>
      </div>
      <LateContext.Provider value={arrived}>
        {tabs.map((tab) => (
          // ⚠️ **링을 안쪽에 긋는다** — aside가 `overflow-hidden`(모서리)이라 바깥 링이 잘린다(DESIGN §7 예외).
          <TabsContent key={tab.value} value={tab.value} className="focus-visible:ring-inset">{tab.panel}</TabsContent>
        ))}
      </LateContext.Provider>
    </Tabs>
  );
}

/** 늦게 도착한 보류 — 자리를 잡지 않는다(대부분 `null`). 도착 전·보류 없음이면 아무것도 그리지 않는다. */
export function LateHold({ children }: { children: ReactNode }) {
  const late = useContext(LateContext);
  return late?.held == null ? null : children;
}

/** PR state 값 — 도착 전에는 `pending`(56px 스켈레톤)이 자리를 잡는다. 값별 모양은 서버가 미리 렌더해 넘긴다. */
export function LatePrState({ pending, values }: { pending: ReactNode; values: Record<PrStateValue, ReactNode> }) {
  const late = useContext(LateContext);
  if (late === undefined) return pending;
  return late.prState === null ? null : values[late.prState];
}
