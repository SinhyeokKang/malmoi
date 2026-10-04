import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";

import { enMessages } from "./en-messages";

/**
 * 화면 언어 → **클라이언트에 넘길 사전**. 서버 컴포넌트가 읽으면 값은 각 `"use client"` 모듈의 client reference이고(Flight가 모듈 참조로
 * 싣는다), 테스트·클라이언트에서는 사전 객체 그 자체다. 루트 레이아웃과 DOM 테스트 헬퍼가 같은 표를 쓴다.
 *
 * ⚠️ **ko·es는 사전이 들어올 때까지 en이다**(ui-locales orch — W2·W3이 `components/i18n/<lang>-messages.ts`를 만들고 자기 줄 하나를 바꾼다).
 * 서버 쪽 표는 `lib/i18n/server.ts`의 `DICTIONARIES`다 — 둘은 같은 커밋에서 같이 바뀐다.
 */
export const UI_DICTIONARIES: Readonly<Record<UiLocale, Messages>> = {
  en: enMessages,
  ko: enMessages, // TODO(W2): koMessages from "./ko-messages"
  es: enMessages, // TODO(W3): esMessages from "./es-messages"
};
