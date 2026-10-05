"use client";

import dynamic from "next/dynamic";
import { createContext, use, useContext, useMemo, type ComponentType, type ReactNode } from "react";

import type { DateStyle } from "@/lib/date-format";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import type { TimeZone } from "@/lib/time-zone/zones";
import { en } from "@/messages/en";

/**
 * **클라이언트의 사전 입구** (ui-locales design §3.2) — `useMessages()`·`useUiLocale()`. 루트 레이아웃이 요청의 언어로 이 provider 하나를 렌더한다.
 *
 * ⚠️ **ko·es 사전은 언어별 비동기 청크다** (orch D7 — 스파이크 1b 실측, Next 16.3.3 Turbopack). 루트 레이아웃이 **서버에서** import하는
 * client 모듈은 정적이든 `await import()`든 전부 레이아웃의 청크 그룹 하나에 실려 en 페이지도 받는다 — 그래서 사전은 서버 그래프 밖,
 * 이 파일 안의 `next/dynamic` 로더가 읽는다. 실측: 그 언어 페이지의 SSR HTML만 청크를 `<link rel="preload">`로 싣고(쿠키 없는 en HTML은 0회),
 * 클라이언트 로더도 같은 청크를 받는다.
 * ⚠️ **사전 하나당 import 자리는 로더 하나다** — 같은 모듈을 `use(import(...))` 같은 다른 자리에서 또 읽으면 Turbopack이 모듈을 청크 둘로
 * 복제하고 그쪽은 preload되지 않는다(하이드레이션 중 폭포). 로더가 읽은 사전은 언어별 슬롯에 맡기고 `Inner`가 `use()`로 기다린다.
 * ⚠️ **언어별 껍데기로 자식을 감싸지 않는다** — 요소 타입이 언어마다 달라지면 언어를 바꿀 때 그 아래 트리가 다시 마운트돼 포커스·상태가 사라진다
 * (POSTMORTEM 2026-09-07과 같은 형). 자식은 늘 `Inner` 아래 두 번째 자리다. 같은 이유로 `key={uiLocale}`도 걸지 않는다.
 *
 * provider가 없으면 **en**이다 — 루트 레이아웃 밖의 `global-error`와 컴포넌트만 렌더하는 DOM 테스트가 그대로 돈다.
 * 대가는 "provider를 빠뜨리면 조용히 영어"이고, 루트 레이아웃 소스 검사(`app/__tests__/root-layout-i18n.test.ts`)가 막는다.
 * ko·es 사용자도 en을 받는다(이 기본값) — 완료 조건 10은 en 사용자 기준이다.
 */
type Value = { readonly m: Messages; readonly uiLocale: UiLocale; readonly style: DateStyle };

const MessagesContext = createContext<Value>({ m: en, uiLocale: "en", style: { uiLocale: "en", timeZone: "UTC" } });

type Slot = { readonly promise: Promise<Messages>; readonly resolve: (messages: Messages) => void };
const slots = new Map<UiLocale, Slot>();

function slot(uiLocale: UiLocale): Slot {
  const found = slots.get(uiLocale);
  if (found !== undefined) return found;
  let resolve: (messages: Messages) => void = () => {};
  const promise = new Promise<Messages>((done) => {
    resolve = done;
  });
  const made = { promise, resolve };
  slots.set(uiLocale, made);
  return made;
}

function Nothing() {
  return null;
}

/** 로더가 받은 사전을 슬롯에 맡긴다 — 운반체 자신은 아무것도 그리지 않는다. */
function arrive(uiLocale: UiLocale, messages: Messages): { default: ComponentType } {
  slot(uiLocale).resolve(messages);
  return { default: Nothing };
}

/**
 * 언어별 사전 운반체 — **줄 하나가 그 언어의 유일한 import 자리다**(서버 쪽은 `lib/i18n/server.ts`의 `DICTIONARIES` 한 줄).
 * en은 위 정적 import가 든다(provider 기본값과 같은 객체).
 */
const CARRIERS: Readonly<Partial<Record<UiLocale, ComponentType>>> = {
  ko: dynamic(() => import("@/messages/ko").then((mod) => arrive("ko", mod.ko))),
  es: dynamic(() => import("@/messages/es").then((mod) => arrive("es", mod.es))),
};

function Inner({ uiLocale, timeZone, children }: { uiLocale: UiLocale; timeZone: TimeZone; children: ReactNode }) {
  const m = CARRIERS[uiLocale] === undefined ? en : use(slot(uiLocale).promise);
  // 날짜 형은 따로 memo한다 — `useDateStyle()`이 같은 값에서 같은 객체를 돌려줘야 deps로 쓴 자리가 매 렌더 다시 돌지 않는다.
  const style = useMemo(() => ({ uiLocale, timeZone }), [uiLocale, timeZone]);
  const value = useMemo(() => ({ m, uiLocale, style }), [m, uiLocale, style]);
  return <MessagesContext value={value}>{children}</MessagesContext>;
}

/**
 * `timeZone`은 보는 사람이 고른 시간대(user-timezone — 루트 레이아웃이 `getDateStyle()`에서 넘긴다). 바뀌어도 context 값의 필드만 바뀌고
 * 트리는 다시 마운트되지 않는다(위 껍데기 규칙과 같다).
 */
export function MessagesProvider({ uiLocale, timeZone, children }: { uiLocale: UiLocale; timeZone: TimeZone; children: ReactNode }) {
  const Carrier = CARRIERS[uiLocale];
  // ⚠️ 운반체가 `Inner`보다 **앞** 형제다 — 첫 렌더 패스에서 lazy 로더가 먼저 시작돼야 `Inner`의 `use()`가 기다릴 것이 생긴다.
  return (
    <>
      {Carrier !== undefined && <Carrier />}
      <Inner uiLocale={uiLocale} timeZone={timeZone}>{children}</Inner>
    </>
  );
}

export function useMessages(): Messages {
  return useContext(MessagesContext).m;
}

/** 날짜·상대 시각·언어명 헬퍼에 넘길 화면 언어 코드. */
export function useUiLocale(): UiLocale {
  return useContext(MessagesContext).uiLocale;
}

/** 날짜 포맷(`lib/date-format.ts`)에 넘길 `{ uiLocale, timeZone }` — provider가 없으면 en·UTC. 같은 provider 값에서는 같은 객체다. */
export function useDateStyle(): DateStyle {
  return useContext(MessagesContext).style;
}
