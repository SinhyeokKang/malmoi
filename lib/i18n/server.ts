import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { readSession } from "@/lib/auth/read-session";
import type { Messages } from "@/lib/i18n";
import { UI_LOCALE_COOKIE, resolveUiLocale, type UiLocale } from "@/lib/i18n/locales";
import { en } from "@/messages/en";

/**
 * 화면 언어 → 서버가 쓰는 사전. ⚠️ **ko·es는 사전이 들어올 때까지 en이다**(ui-locales orch — W2·W3이 자기 줄 하나를 바꾼다).
 * 클라이언트 쪽 표는 `components/i18n/ui-dictionaries.ts`다 — 둘은 같은 커밋에서 같이 바뀐다.
 */
const DICTIONARIES: Readonly<Record<UiLocale, Messages>> = {
  en,
  ko: en, // TODO(W2): ko from "@/messages/ko"
  es: en, // TODO(W3): es from "@/messages/es"
};

/**
 * **요청의 화면 언어** — 계정(`User.uiLocale`) > 기기 쿠키 > en(`resolveUiLocale`). React `cache`로 렌더 요청 하나에 한 번 정한다.
 *
 * ⚠️ **각 서버 소비자가 직접 묻는다** — 루트 레이아웃이 정해 아래로 흘려보내지 않는다. App Router는 레이아웃과 페이지를 병렬로
 * 렌더한다(POSTMORTEM 2026-08-31). 세션 읽기는 `readSession`과 같은 요청 캐시를 지나 왕복이 늘지 않는다.
 * ⚠️ 세션을 못 읽으면(`unavailable`) 거부가 아니라 쿠키로 넘어간다 — 화면 언어는 인가가 아니다.
 * ⚠️ **공유 코어(`lib/**`)는 이것을 부르지 않는다** — `m`을 인자로만 받는다(design §3.2, `dictionary-consistency.test.ts` ⑧).
 */
export const getUiLocale = cache(async function getUiLocale(): Promise<UiLocale> {
  const session = await readSession();
  const cookie = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  return resolveUiLocale({ account: session.status === "ok" ? session.uiLocale : null, cookie });
});

/** 서버 컴포넌트·페이지·Server Action의 사전 입구 — `const m = await getMessages()`. */
export async function getMessages(): Promise<Messages> {
  return DICTIONARIES[await getUiLocale()];
}
