import { localeProgress, type LocaleProgress } from "@/lib/keys/view";

/**
 * Home(`/projects/:slug`)의 순수 판정 둘 (6b-6).
 *
 * ⚠️ **이 화면의 가장 큰 위험은 복제다** (SAAS §7.7 결정 2). 번역 화면 툴바가 키 수·미배포 건수·
 * 마지막 전송·PR 링크를 들고 설정 화면이 리포·연결·적재 상태를 든다 — 세 번째 사본을 만들면 그중
 * 하나가 낡는다. 그래서 진행률은 **6b-5의 `localeProgress`를 그대로 쓰고**, 여기서 새로 정하는 것은
 * "어느 로케일이 일거리인가"와 "세 출처를 어떻게 한 줄로 세우나"뿐이다.
 */

/**
 * Home이 보이는 진행률 — **orphaned 로케일을 뺀다.**
 *
 * ⚠️ 그 파일은 리포에서 사라졌고 번역 화면에서 그 열의 입력이 `disabled`다(ARCHITECTURE §5.5.16).
 * Home의 행은 `?focus=` 링크이므로, 넣으면 번역자를 **편집할 수 없는 열**로 데려간다. 로케일
 * 화면(6b-5)은 반대로 그것을 **보여주는 것**이 요지다 — 같은 데이터에 다른 질문이라 함수가 둘이다.
 */
export function activeLocaleProgress(input: Parameters<typeof localeProgress>[0]): LocaleProgress[] {
  return localeProgress(input).filter((locale) => !locale.orphaned);
}

/** 사람이 만진 편집 한 건. `actor`는 `actorLabel`이 이미 라벨로 바꾼 값이다(못 찾으면 원문·`null`). */
export type RecentEdit = {
  at: Date;
  key: string;
  namespace: string;
  locale: string;
  actor: string | null;
};

/**
 * 활동 한 줄. **셋뿐인 이유는 `SyncRun`이 아직 없기 때문이다** (SAAS §6 · §7.7 결정 3) — 7단계가
 * 그 테이블을 세우면 이 블록이 거기로 갈아탄다. 지금 낼 수 있는 것은 "변경 이력"이 아니라 그 부분집합이다.
 */
export type ActivityItem =
  | ({ kind: "edit" } & RecentEdit)
  | { kind: "push"; at: Date }
  | { kind: "publish"; at: Date; prUrl: string | null };

/**
 * ⚠️ **동시각 정렬이 결정적이어야 한다.** 같은 DB 상태가 같은 화면을 내야 하고, 안 그러면 새로고침마다
 * 순서가 바뀌는 목록이 된다 — export 결정성과 같은 축이다. 리포 수준 사건이 그 시각의 편집 **위**에
 * 온다: 그것들이 편집을 감싸는 사건이다.
 */
const RANK: Record<ActivityItem["kind"], number> = { publish: 0, push: 1, edit: 2 };

export function recentActivity(input: {
  edits: readonly RecentEdit[];
  /** CI push. 첫 적재 전이면 null이다. */
  lastCommitAt: Date | null;
  /** 마지막으로 **보낸** 시각. ⚠️ `skipped`는 이 값을 안 건드린다 (design §3.4). */
  lastPublishedAt: Date | null;
  lastPrUrl: string | null;
  limit: number;
}): ActivityItem[] {
  const items: ActivityItem[] = input.edits.map((edit) => ({ kind: "edit", ...edit }));
  // ⚠️ **시각이 없는 출처는 사건이 아니다.** `lastPrUrl`만 있는 상태는 존재하지 않아야 하지만,
  // 있더라도 "언제"를 모르는 것을 목록에 세우지 않는다.
  if (input.lastCommitAt !== null) items.push({ kind: "push", at: input.lastCommitAt });
  if (input.lastPublishedAt !== null) {
    items.push({ kind: "publish", at: input.lastPublishedAt, prUrl: input.lastPrUrl });
  }

  /**
   * ⚠️ **DB가 준 순서에 기대지 않는다.** `Array.sort`는 안정 정렬이라, 시각·종류가 같은 편집 둘의
   * 순서를 **입력 그대로 보존한다** — 조회의 `orderBy`에 보조 키가 없으면 그것이 요청마다 다를 수
   * 있고, 그러면 같은 DB 상태가 다른 화면을 낸다. 조회 쪽에도 보조 키를 뒀지만(어느 N건을 고를지가
   * 그것으로 정해진다) **보증은 여기 있어야 테스트가 잡는다.**
   */
  items.sort(
    (a, b) =>
      b.at.getTime() - a.at.getTime() ||
      RANK[a.kind] - RANK[b.kind] ||
      // 편집끼리만 남는 갈래다 — push·publish는 종류가 유일해 위에서 갈린다.
      compareEdit(a, b),
  );
  // ⚠️ **자르는 것은 병합 뒤다.** 편집만 먼저 자르면 push·publish가 항상 밀려나 화면에서 사라진다.
  return items.slice(0, input.limit);
}

/**
 * 같은 시각·같은 종류의 편집 둘. **키 → 로케일 코드 유닛 비교**다 — `localeCompare`는 로케일 설정에
 * 따라 답이 달라서 이 리포가 export 정렬에서도 쓰지 않는다 (ARCHITECTURE §1.1).
 */
function compareEdit(a: ActivityItem, b: ActivityItem): number {
  if (a.kind !== "edit" || b.kind !== "edit") return 0;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  if (a.locale === b.locale) return 0;
  return a.locale < b.locale ? -1 : 1;
}
