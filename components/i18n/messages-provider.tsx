"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import { en } from "@/messages/en";

/**
 * **클라이언트의 사전 입구** (ui-locales design §3.2) — `useMessages()`·`useUiLocale()`. 루트 레이아웃이 요청의 언어로 이 provider 하나를 렌더한다.
 *
 * ⚠️ **사전은 언어별 `"use client"` 모듈이 client reference로 넘긴다**(`components/i18n/<lang>-messages.ts` → `ui-dictionaries.ts`).
 * 사전 객체를 prop으로 직렬화할 수는 없지만(함수·ReactNode 값) client reference는 Flight가 그대로 싣고 브라우저가 그 모듈의
 * export로 푼다 — 그래서 **렌더된 언어의 청크만** 받는다.
 * ⚠️ **언어별 껍데기 컴포넌트로 감싸지 않는다** — 언어마다 요소 타입이 다르면 언어를 바꿀 때 React가 그 아래 트리를 통째로 다시
 * 마운트해 컨트롤의 포커스·상태가 사라진다(POSTMORTEM 2026-09-07과 같은 형). 타입은 이 컴포넌트 하나이고 바뀌는 것은 prop뿐이다.
 * 같은 이유로 `key={uiLocale}`도 걸지 않는다.
 *
 * provider가 없으면 **en**이다 — 루트 레이아웃 밖의 `global-error`와 컴포넌트만 렌더하는 DOM 테스트가 그대로 돈다.
 * 대가는 "provider를 빠뜨리면 조용히 영어"이고, 루트 레이아웃 소스 검사(`app/__tests__/root-layout-i18n.test.ts`)가 막는다.
 */
type Value = { readonly m: Messages; readonly uiLocale: UiLocale };

const MessagesContext = createContext<Value>({ m: en, uiLocale: "en" });

export function MessagesProvider({ uiLocale, messages, children }: { uiLocale: UiLocale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ m: messages, uiLocale }), [messages, uiLocale]);
  return <MessagesContext value={value}>{children}</MessagesContext>;
}

export function useMessages(): Messages {
  return useContext(MessagesContext).m;
}

/** 날짜·상대 시각·언어명 헬퍼에 넘길 화면 언어 코드. */
export function useUiLocale(): UiLocale {
  return useContext(MessagesContext).uiLocale;
}
