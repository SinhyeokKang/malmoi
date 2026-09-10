/**
 * push 페이로드의 **오배송·역행 거부** (ARCHITECTURE §5.5.5).
 *
 * **둘 다 거부이지 병합이 아니다** — 어긋난 요청을 어떻게든 반영하려 들면 그게 diff
 * 동기화이고 코어 원칙(MVP §2)을 깬다. 통과하지 못하면 409다.
 *
 * ⚠️ **환경변수를 여기서 읽지 않는다.** 호출부가 넘긴다 — 모듈 최상위 평가가 "파일을
 * 읽기만 해도 죽는다"를 뜻해 CI를 red로 만든 전례가 있다 (POSTMORTEM 2026-08-31).
 * `lib/push/auth.ts`가 `expected`를 인자로 받는 것과 같은 이유다.
 */
export type GuardResult = "ok" | "wrong-project" | "stale-commit" | "wrong-format" | "archived";

/**
 * 보관된 프로젝트는 CI push도 안 받는다 (7단계 — sync-runs design §4, 결정 9).
 *
 * ⚠️ **보관의 뜻이 "멈춘다"다.** 리포가 계속 덮으면 보관 중에 번역이 조용히 바뀌는데, strict push라
 * 그 덮어쓰기는 되돌릴 수 없다 (`Translation`의 FK가 RESTRICT라 이물 키도 못 지운다). 대상 리포
 * CI가 red가 되는 것은 **의도된 신호**다 — 워크플로를 떼라는 뜻이다.
 */
export function checkArchived(archivedAt: Date | null): GuardResult {
  return archivedAt === null ? "ok" : "archived";
}

/**
 * 페이로드가 **이 토큰이 정한 프로젝트**를 향하는가.
 *
 * 어긋난 페이로드가 적용되면 그 프로젝트의 키가 전부 orphan되고 이물 키가 삽입되는데,
 * `PushPlan`에 `toDelete`가 없고 `Translation`의 FK가 `RESTRICT`라 **지울 수 없다.**
 *
 * ⚠️ **두 번째 인자가 2026-09-07에 바뀌었다** — 서버 env의 활성 프로젝트 slug 하나에서
 * `project.slug`(토큰으로 조회한 행)로. 순수 함수라 판정은 그대로이고 바뀐 것은 "무엇과 대조하는가"다.
 * 페이로드 slug로 행을 찾아 대조하면 순환이라 아무것도 막지 못한다 — 조회가 먼저, 대조가 나중이다
 * (design §3.8).
 */
export function checkProjectSlug(payloadSlug: string, activeSlug: string): GuardResult {
  // Actions가 셸 치환으로 값을 만들면 개행이 딸려올 수 있다.
  const given = payloadSlug.trim();
  const active = activeSlug.trim();
  // fail-closed: 빈 값끼리의 일치를 통과로 읽으면 설정 누락이 곧 무제한 라우팅이 된다.
  // `verifiedEmailFrom`(`lib/auth/email.ts`)이 빈 이메일을 막는 것과 같은 원리다.
  if (given === "" || active === "") return "wrong-project";
  return given === active ? "ok" : "wrong-project";
}

/**
 * 이 페이로드가 **그 프로젝트가 확정한 번역 표면**을 향하는가 (2026-09-07).
 *
 * 온보딩은 후보를 사용자에게 확정받아 재검증한 값을 저장하는데(`planConfirmedFormat`), `applyPush`는
 * 페이로드의 포맷으로 그 컬럼 셋을 **덮어쓴다**. 그래서 CI가 다른 표면을 보내면 확정이 조용히 뒤집힌다:
 *
 * - 자동 후보의 워크플로 YAML은 `adapter:`·`base-locale:`을 박지 않고(`renderWorkflowYaml`),
 *   `push:local`은 그때 `detectFormat`으로 **1순위**를 고른다 — 2순위를 확정한 프로젝트가 정확히
 *   그 경로로 덮인다 (한 리포에 표면이 둘인 `i18n-format-check`가 실물이다 — SAAS §7.1).
 * - 결과는 strict 덮어쓰기라 **그 프로젝트의 키가 전부 orphan되고 이물 키가 삽입된다.** `PushPlan`에
 *   `toDelete`가 없고 `Translation`의 FK가 `RESTRICT`라 되돌릴 수 없다 — `checkProjectSlug`가 막는
 *   것과 같은 피해다.
 *
 * ⚠️ **`baseLocale`도 본다.** 그 값이 키 집합의 진실이라, 확정한 base와 다른 base로 적재하면 진짜
 * base에만 있는 키가 빠져 orphaned로 떨어진다 (2026-09-04 audit #1).
 *
 * ⚠️ **아직 비어 있으면 통과시킨다** — "포맷은 push가 채운다"가 원래 계약이고(`schema.prisma`),
 * 온보딩 밖에서 만들어진 행은 첫 push가 그 값을 심는다. 좁아지는 것은 "한 번 채워진 뒤"부터다.
 *
 * ⚠️ **정당한 이전(리포가 로케일 파일을 옮겼다)도 여기서 409가 된다.** 서버는 GitHub을 부르지 않아
 * (§5.5.5) 그것을 오배송과 구별할 수 없고, 재설정 UI는 7단계(`needs_configuration`)다. 조용히 덮는
 * 것보다 시끄럽게 멈추는 쪽을 고른다 — 손실이 되돌릴 수 없는 방향이다.
 *
 * ⚠️ **`nested`·`nestedByPath`는 비교하지 않는다.** 그 둘은 "같은 파일이 지금 어떤 모양인가"의
 * 관측값이라 리포가 정당하게 바꿀 수 있다(평평했던 파일을 중첩으로 정리한다) — 비교에 넣으면 그
 * 편집이 CI 409가 된다. 여기서 묻는 것은 **어느 표면인가**이고 그것을 정하는 것은 이 셋이다.
 *
 * 트림하지 않는다: 이 셋은 셸 치환이 아니라 **탐지 결과**에서 오고, `--adapter`·`--base`로 들어온
 * 값은 `isAdapterName`·`assemblePushInput`이 CLI에서 먼저 거부한다.
 *
 * ⚠️ **`baseLocale`만 `declaredBaseLocale`도 받는다** (6b-3 — design §3.13). OWNER가 설정 화면에서
 * 선언한 값이고, 그것이 없으면 base를 바꾸는 순간 그 리포의 push가 **영영 409**다(워크플로를 고쳐도
 * 저장값은 옛 base라 되돌릴 경로가 DB 직접 수정뿐이다). **느슨해지는 것은 base 하나이고**
 * `adapter`·`pathTemplate`은 그대로 엄격하다 — 오배송을 막는 것은 그 둘이다.
 */
export function checkFormat(
  payload: { adapter: string; pathTemplate: string; baseLocale: string },
  stored: {
    adapterName: string | null;
    pathTemplate: string | null;
    baseLocale: string | null;
    /** OWNER의 **일회용 허가**. `applyPush`가 push 성공 시 비운다 — 안 비우면 영구 예외가 된다. */
    declaredBaseLocale: string | null;
  },
): GuardResult {
  // 셋은 항상 함께 쓰인다(`applyPush`·`createProject`) — 전부 비어 있는 것만 "아직 없다"다.
  // ⚠️ **선언은 이 판정에 넣지 않는다** — 현실이 비어 있는데 선언만 있는 행은 온보딩 중이고,
  // 그 상태의 첫 push는 아래를 지나지 않고 여기서 통과해야 한다.
  if (stored.adapterName === null && stored.pathTemplate === null && stored.baseLocale === null) {
    return "ok";
  }
  // 일부만 있는 상태는 이해할 수 없다 — 그걸 통과시키면 절반이 비어 있는 행이 무제한 표면 교체를 받는다.
  const baseAllowed =
    payload.baseLocale === stored.baseLocale ||
    (stored.declaredBaseLocale !== null && payload.baseLocale === stored.declaredBaseLocale);
  return payload.adapter === stored.adapterName && payload.pathTemplate === stored.pathTemplate && baseAllowed
    ? "ok"
    : "wrong-format";
}

/**
 * 이 push가 **base 로케일을 바꾸는가** — `planPush`가 `needsReview` 전파를 건너뛸지 정한다
 * (design §3.13).
 *
 * ⚠️ 저장값이 없으면(첫 push) 변경이 아니다 — 비교 대상이 없고 기존 키도 없어 전파할 것이 애초에
 * 없다. 여기서 `true`를 내면 "첫 push는 전파를 끈다"는 무의미한 특례가 하나 생긴다.
 */
export function isBaseLocaleChange(payloadBase: string, storedBase: string | null): boolean {
  if (storedBase === null) return false;
  return payloadBase !== storedBase;
}

/**
 * 이 커밋이 마지막으로 적재한 커밋보다 뒤인가.
 *
 * strict라 오래된 run을 Re-run하면 DB가 그 시점으로 되돌아간다 — 키가 orphan되고
 * 번역값이 회귀하고 permalink가 옛 SHA를 가리킨다. 되돌릴 경로가 없다.
 *
 * **같은 시각은 통과시킨다.** 같은 커밋의 재전송은 strict에서 결과가 같고, 스캐너를 고쳐
 * 다시 올리는 것은 정당하다 — 그래서 판정 기준이 `commitSha` 동일성이 아니라 시각 역행이다.
 */
export function checkCommitOrder(commitAt: Date, lastCommitAt: Date | null): GuardResult {
  const at = commitAt.getTime();
  // ⚠️ Invalid Date는 NaN이고 **NaN 비교는 양방향 모두 false**라 그냥 두면 조용히 통과한다.
  if (Number.isNaN(at)) return "stale-commit";
  if (lastCommitAt === null) return "ok";
  return at < lastCommitAt.getTime() ? "stale-commit" : "ok";
}

/** 거부는 **409**다 — 페이로드 형식이 아니라 서버 상태와의 충돌이라 400이 아니다. */
export function guardStatus(result: GuardResult): number {
  return result === "ok" ? 200 : 409;
}
