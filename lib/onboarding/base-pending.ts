/**
 * 기준 로케일 변경이 **대기 중인가** (translation-ui design §3.13, 6b-3).
 *
 * `Project.declaredBaseLocale`은 "다음 CI push가 이 base를 가져오면 받아들이겠다"는 OWNER의
 * **일회용 허가**이고, `Project.baseLocale`은 리포가 마지막으로 확인해 준 **현실**이다. 둘이
 * 어긋난 동안이 대기 상태다 — 그 사이에도 pull은 옛 base로 정상 동작하고 옛 base로 오는 CI
 * push도 통과한다(멈추면 편집 손실 창이 대기 기간만큼 늘어난다 — design §3.13).
 *
 * ⚠️ **두 화면이 이 함수 하나를 읽는다** — 설정의 `Alert warning`과 번역 화면의 배너. 각자
 * 조건을 쓰면 하나가 낡고, 그때 "경고는 사라졌는데 실제로는 아직 대기 중"이 된다.
 *
 * ⚠️ **import이 없어야 한다 — 잎이다.** 클라이언트 컴포넌트가 값으로 읽는다.
 */
export function basePending(input: { baseLocale: string | null; declaredBaseLocale: string | null }): boolean {
  /**
   * 첫 push 전이라 현실이 없다. 그때 선언은 의미가 없다 — 첫 push가 base를 심고 `checkFormat`도
   * "전부 비어 있으면 통과"라 무엇이든 받는다. 대기로 표시하면 온보딩 중에 경고가 뜬다.
   */
  if (input.baseLocale === null || input.declaredBaseLocale === null) return false;
  // 선언을 현실과 같은 값으로 다시 저장하는 것이 **되돌리는 경로**다 — 별도 취소 버튼을 두지 않는다.
  return input.declaredBaseLocale !== input.baseLocale;
}
