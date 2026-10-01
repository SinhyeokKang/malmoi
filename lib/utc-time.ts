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
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 컴포넌트(`publish-button.tsx`)가 값으로 읽는다.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function utcDay(at: Date): string {
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()}`;
}

export function utcMinute(at: Date): string {
  return `${utcDay(at)} ${at.toISOString().slice(11, 16)} UTC`;
}

/** 날짜가 과한 자리(계정 병합 확인의 가입 시점)의 형 — 로케일 포맷터 대신 같은 월 약어를 쓴다. */
export function utcMonth(at: Date): string {
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
