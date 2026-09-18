import { planSlug } from "./slug";

/**
 * DESIGN §6.7의 단계별 조건을 코드로. 껍데기가 [Next]를 그릴 때 부른다 — 단계는 본문과 이 상태만 넘긴다.
 *
 * ⚠️ **`lib/` 아래 잎에 둔다.** `components/` 아래면 `"use client"` 그래프에 들어가고, 그러면
 * `client-graph.test.ts`가 요구하는 "타입만 물어라" 제약이 이 모듈까지 따라온다.
 *
 * ⚠️ **제출 중(`nextPending`)은 여기 없다.** 그것은 껍데기가 버튼을 로딩으로 바꾸며 함께 잠그는
 * 별개 축이다 — 두 곳에서 같은 걸 판정하면 한쪽만 고쳐진다.
 */
export type Step = 1 | 2 | 3 | 4;

export type NextState = {
  /** 예외 J — 전 단계 공통. 모달은 닫지 않고 입력을 지킨 채 [Next]만 잠근다. */
  sessionExpired: boolean;
  repoSelected: boolean;
  /** 예외 C′ — `checkRepoAccess` 거부. 사유는 한 갈래로 접힌 채다(존재 오라클 방어). */
  repoAccessDenied: boolean;
  repoListLoading: boolean;
  detecting: boolean;
  /** 예외 F — 탐지 실패. ①의 선택은 지키고 "아무것도 만들어지지 않았다"를 말한다. */
  detectFailed: boolean;
  candidateSelected: boolean;
  /** 예외 E — 후보 0개라 수동 지정 폼이 섰다. */
  manualEntry: boolean;
  manualMatched: boolean;
  name: string;
  slug: string;
  baseLocale: string;
  /** 예외 G — 제출이 `slug-taken`으로 돌아왔다. 사용자가 고쳐야 다시 열린다. */
  slugTaken: boolean;
};

export function nextEnabled(step: Step, s: NextState): boolean {
  if (s.sessionExpired) return false;
  switch (step) {
    case 1:
      return s.repoSelected && !s.repoAccessDenied && !s.repoListLoading;
    case 2:
      if (s.detecting || s.detectFailed) return false;
      // 수동 지정에서는 매칭이 곧 검증이다 — 옛 후보 선택이 [Next]를 열어 주지 않는다.
      return s.manualEntry ? s.manualMatched : s.candidateSelected;
    case 3:
      return !s.slugTaken && s.name.trim() !== "" && s.baseLocale !== "" && planSlug(s.slug) === "ok";
    case 4:
      // ④는 모든 첫 적재가 커밋된 성공 상태다.
      return true;
  }
}
