import type { Adapter, AdapterName } from "@/lib/adapters/types";

/**
 * 온보딩 화면이 서버에서 받는 값의 모양 (feature design §5).
 *
 * ⚠️ **여기는 타입만 산다.** 모달과 단계 파일들이 `"use client"`라 `lib/adapters`·`lib/onboarding/detect`를
 * **값으로** import하면 ts-morph가 클라이언트 번들에 들어온다 (POSTMORTEM 2026-09-07, 7.2MB —
 * `components/__tests__/client-graph.test.ts`가 그 그래프를 센다). 라벨·예시·글리프 갈래는 서버가 내려준다.
 */

/** ①의 리포 행. `suggestedSlug`는 `normalizeProjectSlug`, `pushedAt`은 GitHub 응답 그대로(ISO)다. */
export type RepoOption = {
  owner: string;
  repo: string;
  fullName: string;
  suggestedSlug: string;
  pushedAt: string | null;
};

/**
 * ②의 수동 지정 셀렉트 선택지. `formatLabel`(design §3.3 표)이 만든다.
 *
 * ⚠️ **`layout`은 서버가 `Adapter.layout`에서 그대로 내려준다** — 화면이 `lib/adapters`를 값으로 읽으면
 * 위의 번들 문제가 그대로 돌아온다.
 */
export type AdapterChoice = { adapter: AdapterName; layout: Adapter["layout"]; label: string; example: string };
