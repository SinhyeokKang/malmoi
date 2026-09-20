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
/**
 * ⚠️ **활동 조합이 2026-09-20에 사라졌다** (logs-rework 결정 — `recentActivity` · `RecentEdit` ·
 * `ActivityItem` · `RANK` · `ACTIVITY_WINDOW_DAYS` · `ACTIVITY_LIMIT` · `compareSame`).
 *
 * 그 함수는 출처 넷(`Translation.updatedAt` · `lastCommitAt` · `lastPublishedAt` · `lastImportFailedAt`)을
 * 그때그때 조합했는데 **조합은 사건을 보존하지 못한다**: 같은 셀을 세 번 고치면 한 줄이고, 적재
 * 실패가 둘이면 컬럼이 하나라 하나만 남았다. 7일 창은 조용한 프로젝트의 카드를 통째로 비웠다.
 *
 * 지금 Home은 `lib/events/query.ts`의 **같은 스트림 최신 여섯**을 읽는다 — 정렬·권한 판정·참조 ID가
 * 한 곳에서 나온다. `activeLocaleProgress`는 그대로 남는다(그쪽은 조합이 아니라 집계다).
 */

