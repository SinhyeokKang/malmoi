/**
 * 원고 렌더러와 그 곁 잎(404의 주소 되비침)이 같이 쓰는 클래스. ⚠️ **`"use client"` 모듈에 두지 않는다** — 서버 컴포넌트가
 * 클라이언트 모듈의 값을 import하면 값이 아니라 클라이언트 참조가 온다. 이 파일은 import 0이다.
 */

/** 본문 링크 — 내부든 외부든 파랑 · 밑줄 없음 · 포커스 링 셋(DESIGN §6.3 · §7). */

/**
 * **공개 문서 셋(`/docs` 원고 · `/privacy` 방침 · `/changelog` 본문)의 글자 급과 간격** — 한 벌이다(2026-09-28 사용자 — Changelog에서
 * 눈으로 맞춘 값을 셋에 공통 적용했다). 태그는 페이지 구조가 정한다: `/docs`·`/privacy`는 페이지 제목이 `h1`이라 절이 `h2`,
 * `/changelog`는 버전이 `h1`이라 본문 `##`가 `h1`이다. **모양은 태그가 아니라 급이 정한다.**
 *
 * 페이지 제목 36/1.3/600 → 절 제목 24/1.4/600 · 위 32 → 소제목 20/1.4/500 · 위 20(600은 24px 이상에만 — DESIGN §4) → 작은 제목 18/1.5/500 · 위 16 →
 * 문단·목록 16/1.6 · 위 8 · 항목 사이 4.
 * ⚠️ **뷰포트 `lg` 미만은 표시급만 한 단계 내린다**(responsive-public D3) — 페이지 제목 30 · 절 제목 20. 본문 16·표 14·코드 0.875em은 그대로다.
 * 375 본문 317에서 36·24는 절마다 화면 높이를 먹는다.
 */
export const PAGE_TITLE = "m-0 text-4xl leading-[1.3] font-semibold max-lg:text-3xl";
export const SECTION_HEADING = "m-0 mt-8 text-2xl leading-[1.4] font-semibold max-lg:text-xl";
export const SUB_HEADING = "m-0 mt-5 text-xl leading-[1.4] font-medium";
export const MINOR_HEADING = "m-0 mt-4 text-lg leading-normal font-medium";
export const PROSE = "text-prose mt-2 leading-body text-pretty";
export const LIST = "text-prose mt-2 space-y-1 pl-[22px] leading-body";

/** 인라인 코드 — mono 0.875em · `--muted` · radius 6 · 2/6(시안 1b, #119). */
export const INLINE_CODE = "bg-muted rounded-[6px] px-1.5 py-0.5 font-mono text-[0.875em]";

/**
 * **읽기 그릇의 컨테이너 판정**(responsive-public design §3) — 경계는 뷰포트가 아니라 그릇 바깥의 폭이다(`/docs`는 내비 264가 폭을 먹는다).
 * ⚠️ **선언(그릇 바깥 `@container/reading` — 호출부가 리터럴로 쓴다: `container-query.test.ts`가 className 리터럴에서 선언을 센다)과
 * 질의(`READING_GRID`)는 부모/자식 두 요소다** — 한 요소에 두면 어떤 폭에서도 참이 안 된다
 * (POSTMORTEM 2026-09-15 · `container-query.test.ts`). 이름을 단 것은 안쪽 이름 없는 `@container`(Card 등)가 질의를 가로채지 않게다.
 * - 960 미만: 한 열 · 목차가 본문 앞(TOC DOM은 하나 — 목차가 DOM에서 먼저이고 넓으면 오른쪽 열로 간다).
 * - 640 미만: 좌우 40 → 20(375에서 본문 317).
 * - 뷰포트 `lg` 미만: 위 64 → 40(표시급과 같은 축 — D3).
 * 최대 폭은 그릇마다 다르다(`/docs` 1064 · `/privacy` 1120) — 호출부가 더한다.
 */
export const READING_GRID =
  "mx-auto grid grid-cols-1 gap-x-16 gap-y-8 px-5 pt-16 pb-30 max-lg:pt-10 @[640px]/reading:px-10 @[960px]/reading:grid-cols-[minmax(0,720px)_200px] @[960px]/reading:justify-between";
/** 넓은 두 열에서 본문은 왼쪽 열 · 목차는 오른쪽 열이다 — DOM 순서(목차 먼저)를 grid가 되돌린다. */
export const READING_ARTICLE = "min-w-0 wrap-anywhere @[960px]/reading:col-start-1 @[960px]/reading:row-start-1";
export const READING_TOC_SLOT = "@[960px]/reading:col-start-2 @[960px]/reading:row-start-1";
