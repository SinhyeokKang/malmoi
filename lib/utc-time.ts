/**
 * 절대 시각 한 줄 — `2026-09-10 12:00 UTC` (launch-readiness L7.1 결정 — Logs 화면의 형이 정본이다).
 *
 * ⚠️ **UTC라고 말한다.** 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)을 쓸 뿐 보는 사람의 것이 아니고,
 * 클라이언트에서 로컬로 내면 라벨 없이는 어느 시간대인지 모른다 — 사용자가 자기 시간대로 읽고 **밤 사이 실행의 날짜를
 * 하루 어긋나게** 센다. 정확한 값은 호출부의 `<time dateTime>`이 든다. 상대 시각은 `lib/relative-time.ts`다.
 *
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 컴포넌트(`publish-button.tsx`)가 값으로 읽는다.
 */
export function utcMinute(at: Date): string {
  return `${at.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
