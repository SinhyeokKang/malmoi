import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { readSession } from "@/lib/auth/read-session";
import type { DateStyle } from "@/lib/date-format";
import type { Messages } from "@/lib/i18n";
import { UI_LOCALE_COOKIE, resolveUiLocale, type UiLocale } from "@/lib/i18n/locales";
import { resolveTimeZone } from "@/lib/time-zone/zones";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * 화면 언어 → 서버가 쓰는 사전. 새 언어는 여기 한 줄과
 * 클라이언트 쪽 `components/i18n/messages-provider.tsx`의 `CARRIERS` 한 줄이다 — 둘은 같은 커밋에서 같이 바뀐다.
 * ⚠️ 이 파일은 server-only라 여기서 정적으로 import하는 사전은 클라이언트 번들에 실리지 않는다(`dictionary-consistency.test.ts` ⑥).
 */
const DICTIONARIES: Readonly<Record<UiLocale, Messages>> = {
  en,
  ko,
  es,
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

/**
 * **요청의 날짜 형** — 화면 언어 + 보는 사람의 시간대(user-timezone). 시간대는 계정(`User.timeZone`) 하나뿐이고(쿠키 층 없음)
 * 고르지 않았거나 목록 밖이거나 세션을 못 읽으면 UTC다 — 화면 표시라 거부가 아니다.
 * `getUiLocale`과 같은 이유로 각 서버 소비자가 직접 묻는다.
 * ⚠️ **공개 셸·공유 코어(`lib/**`)·MCP는 이것을 부르지 않는다** — 그쪽은 `{ uiLocale, timeZone: "UTC" }`를 명시한다(`date-format-consumers.test.ts`).
 */
export const getDateStyle = cache(async function getDateStyle(): Promise<DateStyle> {
  const session = await readSession();
  return { uiLocale: await getUiLocale(), timeZone: resolveTimeZone(session.status === "ok" ? session.timeZone : null) };
});

/** 서버 컴포넌트·페이지·Server Action의 사전 입구 — `const m = await getMessages()`. */
export async function getMessages(): Promise<Messages> {
  return DICTIONARIES[await getUiLocale()];
}
