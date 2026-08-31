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
export type GuardResult = "ok" | "wrong-project" | "stale-commit";

/**
 * 페이로드가 지금 운영 중인 프로젝트를 향하는가.
 *
 * 어긋난 페이로드가 적용되면 그 프로젝트의 키가 전부 orphan되고 이물 키가 삽입되는데,
 * `PushPlan`에 `toDelete`가 없고 `Translation`의 FK가 `RESTRICT`라 **지울 수 없다.**
 */
export function checkProjectSlug(payloadSlug: string, activeSlug: string): GuardResult {
  // Actions가 셸 치환으로 값을 만들면 개행이 딸려올 수 있다.
  const given = payloadSlug.trim();
  const active = activeSlug.trim();
  // fail-closed: 빈 값끼리의 일치를 통과로 읽으면 설정 누락이 곧 무제한 라우팅이 된다.
  // `lib/auth/allow.ts`가 빈 항목을 이중으로 막는 것과 같은 원리다.
  if (given === "" || active === "") return "wrong-project";
  return given === active ? "ok" : "wrong-project";
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
