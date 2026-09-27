"use client";

import { usePathname } from "next/navigation";

import { INLINE_CODE } from "./classes";

/**
 * 404의 요청 주소 되비침(시안 `Docs.dc.html` 1d) — `not-found`는 params를 받지 않아 경로를 클라이언트에서 읽는다.
 * 인라인 코드 모양은 원고의 `code`와 같다(`./classes`).
 */
export function RequestedPath() {
  return <code className={INLINE_CODE}>{usePathname()}</code>;
}
