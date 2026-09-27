"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { legacyAnchorTarget } from "@/lib/guide/legacy";

/**
 * 옛 `/docs#<id>`(사전 본문 시절의 절 일곱) → 새 페이지. 해시는 서버에 오지 않으므로 개요의 이 잎이 읽는다.
 *
 * ⚠️ **`replace`다** — 옛 주소를 기록에 남기면 뒤로가기가 다시 여기로 와 같은 곳으로 튕긴다.
 * ⚠️ **표는 서버가 넘긴다** — 이 잎은 `lib/guide/legacy.ts`(import 0)만 읽는다(`client-graph.test.ts`).
 */
export function LegacyHashRedirect({ table }: { table: Readonly<Record<string, string>> }) {
  const router = useRouter();
  useEffect(() => {
    const target = legacyAnchorTarget(window.location.hash, table);
    if (target !== null) router.replace(target);
  }, [router, table]);
  return null;
}
