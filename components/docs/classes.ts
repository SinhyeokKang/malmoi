/**
 * 원고 렌더러와 그 곁 잎(404의 주소 되비침)이 같이 쓰는 클래스. ⚠️ **`"use client"` 모듈에 두지 않는다** — 서버 컴포넌트가
 * 클라이언트 모듈의 값을 import하면 값이 아니라 클라이언트 참조가 온다. 이 파일은 import 0이다.
 */

/** 본문 링크 — 내부든 외부든 파랑 · 밑줄 없음 · 포커스 링 셋(DESIGN §6.3 · §7). */
export const DOC_LINK = "text-link focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * **공개 문서 셋(`/docs` 원고 · `/privacy` 방침 · `/changelog` 본문)의 글자 급과 간격** — 한 벌이다(2026-09-28 사용자 — Changelog에서
 * 눈으로 맞춘 값을 셋에 공통 적용했다). 태그는 페이지 구조가 정한다: `/docs`·`/privacy`는 페이지 제목이 `h1`이라 절이 `h2`,
 * `/changelog`는 버전이 `h1`이라 본문 `##`가 `h1`이다. **모양은 태그가 아니라 급이 정한다.**
 *
 * 절 제목 24/1.4/600 · 위 32 → 소제목 20/1.4/500 · 위 20(600은 24px 이상에만 — DESIGN §4) → 작은 제목 18/1.5/500 · 위 16 → 문단·목록 16/1.6 · 위 8 · 항목 사이 4.
 */
export const SECTION_HEADING = "m-0 mt-8 text-2xl leading-[1.4] font-semibold";
export const SUB_HEADING = "m-0 mt-5 text-xl leading-[1.4] font-medium";
export const MINOR_HEADING = "m-0 mt-4 text-lg leading-normal font-medium";
export const PROSE = "text-prose mt-2 leading-body text-pretty";
export const LIST = "text-prose mt-2 space-y-1 pl-[22px] leading-body";

/** 인라인 코드 — mono 0.875em · `--muted` · radius 6 · 2/6(시안 1b, #119). */
export const INLINE_CODE = "bg-muted rounded-[6px] px-1.5 py-0.5 font-mono text-[0.875em]";
