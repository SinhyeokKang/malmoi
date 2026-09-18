/**
 * 기준 로케일 변경이 **대기 중인가** (ARCHITECTURE §5.5.5, 6b-3).
 *
 * `Project.declaredBaseLocale`은 "다음 CI push가 이 base를 가져오면 받아들이겠다"는 OWNER의
 * **일회용 허가**이고, `Project.baseLocale`은 리포가 마지막으로 확인해 준 **현실**이다. 둘이
 * 어긋난 동안이 대기 상태다 — 그 사이에도 pull은 옛 base로 정상 동작하고 옛 base로 오는 CI
 * push도 통과한다(멈추면 편집 손실 창이 대기 기간만큼 늘어난다 — ARCHITECTURE §5.5.5).
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

/**
 * 설정 화면의 기준 언어 필드가 **보여야 하는 값** — 선언이 있으면 선언이다 (malmoi#20).
 *
 * ⚠️ **현실을 보이면 저장 한 번이 대기 중인 변경을 조용히 취소한다.** 필드가 옛 언어를 보이는
 * 동안 사용자가 브랜치만 고쳐 저장하면, 그 옛 언어가 "고른 값"으로 서버에 가고
 * `planBaseLocaleChange`가 `noop`으로 읽어 **되돌리기 경로가 선언을 지운다** — 배너까지 함께
 * 사라지므로 무음이다. 되돌리기 자체는 옳고, 틀린 것은 "사용자가 현실을 다시
 * 골랐다"는 전제였다. 필드가 선언을 보이면 그 전제가 참이 된다.
 *
 * ⚠️ **`basePending`과 합치지 않는다.** 같은 입력을 받지만 묻는 것이 다르다 — 하나는 "대기인가",
 * 하나는 "무엇을 보일까"다. 합치면 "대기 중에만 선언을 보인다" 같은 절반짜리 규칙이 생긴다.
 */
export function baseLocaleFieldValue(input: {
  baseLocale: string | null;
  declaredBaseLocale: string | null;
}): string | null {
  return input.declaredBaseLocale ?? input.baseLocale;
}
