import type { UiLocale } from "@/lib/i18n/locales";

/**
 * 절대 날짜 `Sep 27, 2026` · 절대 시각 `Sep 27, 2026 16:34 UTC` · 달 `Sep 2026` — 앱의 절대 날짜·시각은 전부 이 파일을 지난다
 * (launch-readiness L7.1 결정 "UTC라고 말한다" — 표기는 2026-09-28 changelog에서 날짜만 쓰는 자리와 한 형으로 모았다).
 *
 * ⚠️ **UTC라고 말한다.** 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)을 쓸 뿐 보는 사람의 것이 아니고,
 * 클라이언트에서 로컬로 내면 라벨 없이는 어느 시간대인지 모른다 — 사용자가 자기 시간대로 읽고 **밤 사이 실행의 날짜를
 * 하루 어긋나게** 센다. 정확한 값은 호출부의 `<time dateTime>`이 든다. 상대 시각은 `lib/relative-time.ts`다.
 *
 * ⚠️ **월 약어를 손으로 든다** — 로케일 날짜 포맷터(`Intl`)는 ICU 빌드와 런타임 TZ에 기대므로 쓰지 않는다
 * (POSTMORTEM 2026-09-20의 grep 0건 규칙).
 *
 * **화면 언어(`uiLocale`)별 형식도 손으로 만든다**(ui-locales) — en `Sep 27, 2026` · ko `2026년 9월 27일` · es `27 sept 2026`.
 * 세 언어 모두 뒤에 `UTC`를 단다.
 *
 * ⚠️ **잎이다 — 값 import가 0이다**(화면 언어 타입만 읽는다). 클라이언트 컴포넌트(`publish-button.tsx`)가 값으로 읽는다.
 */

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** CLDR es 약어 — 9월은 `sept`다(`sep`이 아니다). 마침표를 달지 않는다. */
const ES_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"] as const;

/** 한 날짜의 부품 — 언어별 조립만 다르고 값은 전부 UTC에서 읽는다. */
const parts = (at: Date) => ({ y: at.getUTCFullYear(), mo: at.getUTCMonth(), d: at.getUTCDate() });

export function utcDay(at: Date, uiLocale: UiLocale): string {
  const { y, mo, d } = parts(at);
  if (uiLocale === "ko") return `${y}년 ${mo + 1}월 ${d}일`;
  if (uiLocale === "es") return `${d} ${ES_MONTHS[mo]} ${y}`;
  return `${EN_MONTHS[mo]} ${d}, ${y}`;
}

export function utcMinute(at: Date, uiLocale: UiLocale): string {
  return `${utcDay(at, uiLocale)} ${at.toISOString().slice(11, 16)} UTC`;
}

/** 날짜가 과한 자리(계정 병합 확인의 가입 시점)의 형 — 로케일 포맷터 대신 같은 월 약어를 쓴다. */
export function utcMonth(at: Date, uiLocale: UiLocale): string {
  const { y, mo } = parts(at);
  if (uiLocale === "ko") return `${y}년 ${mo + 1}월`;
  if (uiLocale === "es") return `${ES_MONTHS[mo]} ${y}`;
  return `${EN_MONTHS[mo]} ${y}`;
}
