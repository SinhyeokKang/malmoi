"use client";

import { useEffect, useState } from "react";

const ANNOUNCE_DELAY_MS = 100;

/**
 * 메뉴 안 sr 상태 문장 — region이 **먼저 빈 채로 서고** 문장은 한 박자 뒤에 들어온다. 메뉴 면은 열 때마다 새로 마운트되므로, 문장과 함께
 * 나타나는 region은 낭독이 보장되지 않는다(`CommandStatus` 머리 주석과 같은 이유). ⚠️ **`aria-busy` 밖에 둔다** — busy 안의 변화는 AT가
 * 미뤄도 된다. 소비자는 헤더 Inbox와 사용자 메뉴의 프로젝트 그룹이다(user-menu-projects D4에서 손 사본 둘이 되어 올렸다).
 */
export function LiveStatus({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setShown(text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return <div data-live-status role="status" aria-live="polite" className="sr-only">{shown}</div>;
}
