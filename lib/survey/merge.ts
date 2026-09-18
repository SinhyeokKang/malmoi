import { detectCandidatesAcross } from "../adapters";
import type { DetectedFormat, FileProbe } from "../adapters/types";

/**
 * 어댑터를 **가로지르는** 후보 순위.
 *
 * 오탐에는 두 클래스가 있고 측정하려면 둘 다 후보로 나와야 한다:
 *
 * - **어댑터 내** — 같은 어댑터의 후보 중 순위가 틀림. `public/search/{locale}.json`이 진짜
 *   카탈로그를 눌렀던 bugshot-web 사례. `Adapter.detectCandidates`가 이미 낸다.
 * - **어댑터 간** — 딴 어댑터의 후보가 정답을 가림. bugshot-2에서 `_locales` 4키가 `ts-dict`
 *   903키를 가린 사례(CLAUDE.md "데이터 변경 경로".1).
 *
 * **어댑터 간 순위는 이제 프로덕션이 정한다** (`lib/adapters/index.ts`의 `detectCandidatesAcross` →
 * `rankTemplates`). 전에 여기 적혀 있던 "`detectFormat`은 첫 매치 승"은 폐기된 규칙이다 — 실험이
 * 자기 순위를 따로 들면 측정 대상과 다른 것을 재게 되므로 `candidatesFor`는 위임만 한다.
 */

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
