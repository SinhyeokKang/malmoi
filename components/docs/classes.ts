/**
 * 원고 렌더러와 그 곁 잎(404의 주소 되비침)이 같이 쓰는 클래스. ⚠️ **`"use client"` 모듈에 두지 않는다** — 서버 컴포넌트가
 * 클라이언트 모듈의 값을 import하면 값이 아니라 클라이언트 참조가 온다. 이 파일은 import 0이다.
 */

/** 본문 링크 — 내부든 외부든 파랑 · 밑줄 없음 · 포커스 링 셋(DESIGN §6.3 · §7). */
export const DOC_LINK = "text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/** 인라인 코드 — mono 0.875em · `--muted` · radius 6(시안 1b). */
export const INLINE_CODE = "bg-muted rounded-[6px] px-1 py-0.5 font-mono text-[0.875em]";
