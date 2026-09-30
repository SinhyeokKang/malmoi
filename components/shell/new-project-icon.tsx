"use client";

import { Loader2, Plus } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * 헤더 `New project` 링크의 앞 아이콘 — 이동 중이면 스피너다. ⚠️ 모달 라우트가 도착하기까지 1초 남짓 걸려 반응이 없으면 클릭이
 * 안 먹은 것처럼 보인다(POSTMORTEM 2026-09-17). `useLinkStatus`는 링크의 자손에서만 값을 내므로 이 조각만 클라이언트다 — 헤더는 서버에 남는다.
 */
export function NewProjectIcon() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <Plus className="size-4 shrink-0" aria-hidden />;
}
