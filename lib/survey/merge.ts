import { ADAPTERS, detectCandidatesAcross } from "../adapters";
import type { DetectedFormat, FileProbe } from "../adapters/types";

/**
 * 어댑터를 **가로지르는** 후보 순위.
 *
 * 오탐에는 두 클래스가 있고 측정하려면 둘 다 후보로 나와야 한다:
 *
 * - **어댑터 내** — 같은 어댑터의 후보 중 순위가 틀림. `public/search/{locale}.json`이 진짜
 *   카탈로그를 눌렀던 bugshot-web 사례. `Adapter.detectCandidates`가 이미 낸다.
 * - **어댑터 간** — 딴 어댑터의 후보가 정답을 가림. bugshot-2에서 `_locales` 4키가 `ts-dict`
 *   903키를 가린 사례(MVP §5.1). `detectFormat`이 **첫 매치 승**이라 뒤 어댑터는 실행조차
 *   안 되므로, 여기서 전부 돌려 이어붙인다.
 *
 * **프로덕션(`lib/adapters/`)에 넣지 않는다.** 지금 소비자가 이 측정 실험뿐이고, 온보딩 UI처럼
 * 사람이 후보를 고르는 화면이 생기면 그때 승격한다 (design.md §detect 확장).
 */

/**
 * 어댑터별 후보 목록(= `ADAPTERS` 순서)을 하나로 잇는다.
 *
 * 순위 규칙이 "`ADAPTERS` 순서 → 어댑터 내 순위"라서 **결과의 `[0]`은 언제나 `detectFormat`이
 * 고르는 것과 같다** — `detectFormat`이 정확히 "`ADAPTERS` 순서의 첫 매치"이기 때문이다.
 * 그 불변식이 이 함수가 additive하다는 유일한 근거이므로 테스트가 매 실행 대조한다.
 */
export function mergeCandidates(perAdapter: readonly (readonly DetectedFormat[])[]): DetectedFormat[] {
  return perAdapter.flatMap((list) => [...list]);
}

/**
 * `ADAPTERS` 전부에 `detectCandidates`를 돌려 하나의 순위 목록으로 만든다.
 *
 * **이제 프로덕션(`lib/adapters/detectCandidatesAcross`)에 위임한다** — 실측에서 어댑터 간 순위가
 * 고정 순서라 오탐 5건을 냈고, 그 순위 규칙이 `detectFormat`의 것이 됐다. 실험이 자기 순위를 따로
 * 들면 측정 대상과 다른 것을 재게 된다.
 */
export function candidatesFor(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  return detectCandidatesAcross(paths, probe);
}

/** `ADAPTERS`를 쓰는 소비자가 남아 있는지 확인하는 자리 — 순위는 프로덕션이 정한다. */
export const REGISTERED_ADAPTERS = ADAPTERS;
