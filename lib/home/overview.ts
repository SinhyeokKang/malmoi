import { localeProgress, type LocaleProgress } from "@/lib/keys/view";

/**
 * Home(`/projects/:slug`)의 순수 판정 둘 (6b-6).
 *
 * ⚠️ **이 화면의 가장 큰 위험은 복제다** (PRODUCT §7.7 결정 2). 번역 화면 툴바가 키 수·미배포 건수·
 * 마지막 전송·PR 링크를 들고 설정 화면이 리포·연결·적재 상태를 든다 — 세 번째 사본을 만들면 그중
 * 하나가 낡는다. 그래서 진행률은 **6b-5의 `localeProgress`를 그대로 쓰고**, 여기서 새로 정하는 것은
 * "어느 로케일이 일거리인가"와 "세 출처를 어떻게 한 줄로 세우나"뿐이다.
 */

/**
 * Home이 보이는 진행률 — **orphaned 로케일을 뺀다.**
 *
 * ⚠️ 그 파일은 리포에서 사라졌고 번역 화면에서 그 **행**의 입력이 `disabled`다(ARCHITECTURE §5.5.16 —
 * 8-4가 축을 뒤집어 로케일이 열이 아니라 행이다). Home의 행은 `?locales=` 링크이므로, 넣으면
 * 번역자를 **편집할 수 없는 행**으로 데려간다. 로케일
 * 화면(6b-5)은 반대로 그것을 **보여주는 것**이 요지다 — 같은 데이터에 다른 질문이라 함수가 둘이다.
 */
export function activeLocaleProgress(input: Parameters<typeof localeProgress>[0]): LocaleProgress[] {
  return localeProgress(input).filter((locale) => !locale.orphaned);
}

/** 사람이 만진 편집 한 건. `actor`는 `actorLabel`이 이미 라벨로 바꾼 값이다(못 찾으면 원문·`null`). */
export type RecentEdit = {
  surfaceSlug: string;
  at: Date;
  key: string;
  namespace: string;
  locale: string;
  actor: string | null;
};

/**
 * 활동 한 줄 — **갈래 넷** (DESIGN §6.64).
 *
 * ⚠️ **`{who} added the {surface} surface`는 만들지 않는다.** 출처가 아예 없다 — `SyncRun`은 Publish
 * 전용이고 `trigger`/`status` enum이 그 가정 위에 서므로, 표면 추가 사건을 실으려면 그 테이블의
 * 계약을 넓혀야 한다. 캔버스와의 **의도된 이탈**이다 (`docs/DESIGN.md`).
 *
 * ⚠️ **`sync_failed`는 마지막 하나뿐이다** — `lastImportFailedAt`이 컬럼 하나라 7일 창에 실패가
 * 둘이면 하나만 보인다. **이력이 아니다** (PRODUCT §4.1).
 */
export type ActivityItem =
  | ({ kind: "edit" } & RecentEdit)
  /** ⚠️ **`newKeys`는 그 Sync가 들여온 키 수다** — 표면마다 갈리므로 표면도 함께 든다. */
  | { kind: "push"; at: Date; surfaceSlug: string; newKeys: number }
  /** ⚠️ **`changed`는 파일 수다** (`SyncRun.changed`) — 칸 수가 아니고 문장이 그것을 그대로 말한다. */
  | { kind: "publish"; at: Date; prNumber: number | null; changed: number | null }
  | { kind: "sync_failed"; at: Date; surfaceSlug: string };

/**
 * ⚠️ **동시각 정렬이 결정적이어야 한다.** 같은 DB 상태가 같은 화면을 내야 하고, 안 그러면 새로고침마다
 * 순서가 바뀌는 목록이 된다 — export 결정성과 같은 축이다. 리포 수준 사건이 그 시각의 편집 **위**에
 * 온다: 그것들이 편집을 감싸는 사건이다.
 */
const RANK: Record<ActivityItem["kind"], number> = { publish: 0, push: 1, sync_failed: 2, edit: 3 };

/**
 * ⚠️ **상한이 건수에서 기간으로 바뀌었다.** 8건 고정이면 "오늘 조용했다"와 "7일
 * 조용했다"가 화면에서 구별되지 않는다 — 빈 상태의 설명문이 이 수를 그대로 말하므로 상수가 정본이다.
 */
export const ACTIVITY_WINDOW_DAYS = 7;

/** ⚠️ **건수는 자르는 축이 아니라 방어선이다** — 903키 리포에서 편집이 하루에 수백 건 난다. */
export const ACTIVITY_LIMIT = 20;

export function recentActivity(input: {
  edits: readonly RecentEdit[];
  /** 표면별 마지막 CI push. 첫 적재 전인 표면은 애초에 오지 않는다. */
  pushes: readonly { surfaceSlug: string; at: Date; newKeys: number }[];
  /** ⚠️ `skipped`는 사건이 아니다 — 보낸 것이 없으므로 호출부가 성공한 실행만 싣는다. */
  publishes: readonly { at: Date; prNumber: number | null; changed: number | null }[];
  syncFailures: readonly { surfaceSlug: string; at: Date }[];
  /** 창의 기준. **서버가 한 번 만든 값**이라야 항목마다 경계가 갈리지 않는다. */
  now: Date;
  windowDays: number;
  limit: number;
}): ActivityItem[] {
  const items: ActivityItem[] = [
    ...input.edits.map((edit): ActivityItem => ({ kind: "edit", ...edit })),
    /**
     * ⚠️ **들여온 키가 0이면 사건이 아니다.** `lastCommitAt`은 표면마다 상시로 서 있어 그 줄이
     * 영구히 남는데, `CI synced 0 new keys into web`은 아무것도 말하지 않는다 — 마지막 Sync 시각을
     * 알아야 하는 자리는 메타 열의 `Last sync`다.
     */
    ...input.pushes.flatMap((push): ActivityItem[] => (push.newKeys === 0 ? [] : [{ kind: "push", ...push }])),
    ...input.publishes.map((publish): ActivityItem => ({ kind: "publish", ...publish })),
    ...input.syncFailures.map((failure): ActivityItem => ({ kind: "sync_failed", ...failure })),
  ];

  const since = input.now.getTime() - input.windowDays * 24 * 60 * 60 * 1000;
  const within = items.filter((item) => item.at.getTime() >= since);

  /**
   * ⚠️ **DB가 준 순서에 기대지 않는다.** `Array.sort`는 안정 정렬이라, 시각·종류가 같은 항목 둘의
   * 순서를 **입력 그대로 보존한다** — 조회의 `orderBy`에 보조 키가 없으면 그것이 요청마다 다를 수
   * 있고, 그러면 같은 DB 상태가 다른 화면을 낸다. 조회 쪽에도 보조 키를 뒀지만(어느 N건을 고를지가
   * 그것으로 정해진다) **보증은 여기 있어야 테스트가 잡는다.**
   */
  within.sort((a, b) => b.at.getTime() - a.at.getTime() || RANK[a.kind] - RANK[b.kind] || compareSame(a, b));
  // ⚠️ **자르는 것은 병합 뒤다.** 편집만 먼저 자르면 나머지 갈래가 항상 밀려나 화면에서 사라진다.
  return within.slice(0, input.limit);
}

/**
 * 같은 시각·같은 종류 둘. **표면 → 키 → 로케일 코드 유닛 비교**다 — `localeCompare`는 로케일 설정에
 * 따라 답이 달라서 이 리포가 export 정렬에서도 쓰지 않는다 (ARCHITECTURE §1.1).
 */
function compareSame(a: ActivityItem, b: ActivityItem): number {
  // publish는 시각 하나에 하나뿐이라 기울일 축이 없다.
  if (a.kind === "publish" || b.kind === "publish") return 0;
  if (a.surfaceSlug !== b.surfaceSlug) return a.surfaceSlug < b.surfaceSlug ? -1 : 1;
  if (a.kind !== "edit" || b.kind !== "edit") return 0;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  if (a.locale === b.locale) return 0;
  return a.locale < b.locale ? -1 : 1;
}
