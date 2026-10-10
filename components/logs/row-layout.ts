/**
 * Logs 행의 **좁은 그릇 적층** (responsive-app AT2) — 실물(`event-row.tsx`)과 로딩 골격(`logs/loading.tsx`)이 **같은 상수**를 쓴다.
 * 골격이 따로 적으면 한쪽만 고쳐져 도착 순간 행 높이가 튄다(`sibling-loading.test.tsx`가 둘이 같은 상수를 든다고 센다).
 *
 * ⚠️ **기준은 뷰포트가 아니라 조상 컨테이너 640(`@max-form`)이다** — 날짜 카드(`logs/page.tsx`)가 `@container`를 선언한다. 1024 + LNB 320의
 * 카드(약 614)도 좁은 쪽이다. 선언 요소와 질의 요소는 다르다(POSTMORTEM 2026-09-15).
 *
 * ⚠️ **DOM 순서는 `[시각][글리프][문장+보조줄][결과][chevron]` 그대로다** — CSS `order`가 없다(DESIGN §7, malmoi#82). 좁으면 시각이 **맨 윗줄**,
 * 글리프 · 문장 · chevron이 둘째 줄, 결과 배지가 문장 아래 셋째 줄이다(2026-10-11 지휘 판정 — 시각을 문장 뒤로 보내려면 order가 필요해
 * "문장 첫 줄"보다 DOM 순서·1280 불변이 이긴다). 결과가 비면(번역 편집 등) 셋째 줄이 서지 않는다.
 * chevron만 DOM 끝에서 둘째 줄 오른쪽 칸으로 명시 배치한다 — 장식(`aria-hidden`)이라 읽는 순서에 영향이 없다.
 */
/** 행 루트 — 칸: 글리프 28 · 문장 · chevron 16. */
export const LOG_ROW_STACK = "@max-form:grid @max-form:grid-cols-[1.75rem_minmax(0,1fr)_1rem] @max-form:items-start @max-form:gap-y-1.5";
/** 시각 — 세 칸 전체를 쓰는 윗줄. 넓은 폭의 112 고정은 풀린다. */
export const LOG_ROW_TIME_STACK = "@max-form:col-span-3 @max-form:w-auto";
/** 결과 배지 — 문장 칸 아래. 넓은 폭의 172 고정은 풀리고 왼쪽 정렬이다. 비면 줄이 서지 않는다. */
export const LOG_ROW_RESULT_STACK = "@max-form:col-span-2 @max-form:col-start-2 @max-form:w-auto @max-form:justify-start @max-form:empty:hidden";
/** chevron — 둘째 줄 오른쪽 칸. */
export const LOG_ROW_CHEVRON_STACK = "@max-form:col-start-3 @max-form:row-start-2 @max-form:self-center";
