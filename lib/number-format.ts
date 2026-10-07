import type { UiLocale } from "@/lib/i18n/locales";

/** 서버·브라우저 기본 로케일 대신 화면 언어를 명시해 사전의 수량 문장과 같은 구분자를 쓴다. */
export function formatNumber(value: number, uiLocale: UiLocale): string {
  return value.toLocaleString(uiLocale);
}
