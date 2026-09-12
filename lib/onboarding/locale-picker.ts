/**
 * 로케일을 고르는 컨트롤이 **인라인이냐 목록이냐** (2026-09-13).
 *
 * ⚠️ **잎이다 — import가 없어야 한다.** ②③이 둘 다 클라이언트 컴포넌트라 이 판정을 값으로 읽는다
 * (`key-gap.ts`와 같은 이유: `lib/onboarding/detect.ts`에 두면 그 그래프가 번들에 들어온다).
 *
 * ⚠️ **경계를 화면마다 적지 않는다.** 같은 값을 고르는 컨트롤이 단계마다 다른 형이면 사용자가 두
 * 번 배우고, 한쪽 임계값만 바뀌면 그 차이가 조용히 굳는다 — 실물 57로케일 리포에서 ②는 `Select`인데
 * ③이 라디오 57개를 펼쳤고, **되돌릴 수 없는 결정**을 그 스크롤에서 고르게 했다.
 */

/** 여기까지는 펼친다. 넷이면 한 줄에 들어가고, 다섯부터는 줄이 접히기 시작한다. */
export const LOCALE_PICKER_INLINE_MAX = 4;

export function collapseLocalePicker(count: number): boolean {
  return count > LOCALE_PICKER_INLINE_MAX;
}
