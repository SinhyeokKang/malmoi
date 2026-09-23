/**
 * 상대 시각 한 줄 ("2 days ago" · "in 6 days").
 *
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 컴포넌트가 값으로 읽으므로 그래프가 곧 번들이다.
 * 원래 `lib/keys/view.ts`에 있었는데 그 모듈은 `compareKeys` 때문에 `lib/adapters/shared` →
 * `json-style`을 물고, 멤버 화면의 표 둘이 클라이언트에서 이 함수를 부르면서 그 그래프가 따라왔다
 * (2026-09-08 6b-2 — 당시 `lib/keys/refocus.ts`가 같은 이유로 분리됐다. 그 모듈은 셀 편집과 함께 2026-09-23에 지웠다).
 *
 * ⚠️ **`now`를 인자로 받는다.** 안에서 `new Date()`를 부르면 서버 렌더와 클라이언트 hydration의
 * 기준이 갈려 첫 페인트에서 문구가 바뀐다. 호출부가 한 번 만들어 내려보낸다.
 */
export function relativeTime(then: Date, now: Date): string {
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  // 초 단위를 읽어 주지 않는다 — "12 seconds ago"는 정보가 아니라 소음이다.
  if (abs < 60) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}
