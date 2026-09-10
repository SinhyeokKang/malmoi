/**
 * 이름에서 색을 결정적으로 뽑는다 (2026-09-11 사용자).
 *
 * ⚠️ **아바타 전용이 아니다** — 사용자 아바타와 **프로젝트 아이콘**이 같은 함수를 쓴다(입력만
 * 다르다: 사람 이름 / 프로젝트 이름). 그래서 이름이 `avatarTone`이 아니라 `toneOf`다.
 *
 * ⚠️ **잎이다 (import 0)** — 셸 헤더가 매 페이지에서 렌더하는 클라이언트 트리가 읽는다.
 *
 * ⚠️ **클래스가 아니라 토큰 이름을 낸다.** 판정은 여기, 클래스는 `components/ui/tone.ts`가 든다 —
 * `STATUS_VARIANT`와 같은 형이다. `lib/`가 Tailwind 클래스를 알면 그 규칙이 두 층에 걸친다.
 */

/**
 * ⚠️ **여덟이고 색상환을 고르게 돈다.** 적으면 같은 화면에서 색이 겹쳐 "다른 사람"이라는 신호가
 * 죽고, 많으면 이웃한 둘이 구별되지 않는다.
 */
export const TONES = ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"] as const;

export type Tone = (typeof TONES)[number];

/**
 * 이름 → 색. **같은 이름은 언제나 같은 색이다** — 렌더마다 바뀌면 색이 사람을 가리키지 못하고
 * 그냥 소음이 된다(그래서 `Math.random`이 아니다).
 *
 * ⚠️ **`charCodeAt`이 아니라 코드 포인트로 돈다.** 한글·이모지 이름에서 서로게이트 쌍이 두 번
 * 섞이면 분포가 그 대역에 몰린다.
 *
 * ⚠️ **`>>> 0`으로 부호를 지운다.** 32비트 곱셈이 음수를 낼 수 있고, 음수 나머지는 배열 인덱스가
 * 아니다 — `noUncheckedIndexedAccess`가 켜져 있어도 그 자리는 `undefined`가 된다.
 *
 * ⚠️ **빈 이름도 색을 낸다.** 아바타는 이름이 비어도 `?`를 그리므로, 여기서 `null`을
 * 내면 호출부가 갈래를 하나 더 들어야 한다.
 */
export function toneOf(name: string): Tone {
  let hash = 5381;
  for (const ch of name.trim()) {
    hash = ((hash * 33) ^ (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  // 길이가 8(2의 거듭제곱)이라 나머지가 균등하다.
  return TONES[hash % TONES.length] ?? "rose";
}
