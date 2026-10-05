import type { Messages } from "@/lib/i18n";

/**
 * LNB 개수 배지의 sr 문장 — 숫자는 `aria-hidden`이다(`CountBadge`). **개수를 드는 항목만** 여기 있고, 문자열 배지(Changelog 버전)는 개수가 아니다.
 * ⚠️ 문장을 `lib/shell/nav.ts`가 아니라 여기서 고른다 — 그쪽은 개수만 내고, 그 개수를 읽히는 방식은 화면의 몫이다.
 * 사이드바(`sidebar.tsx`, `"use client"`)와 랜딩 목업(`components/landing/mockup/app-frame.tsx`, 서버 컴포넌트)이 같이 쓴다 —
 * 클라이언트 파일의 export는 서버 컴포넌트에서 값이 아니라 참조라서 순수 모듈로 뗐다.
 */
export function navCountLabel(m: Messages, key: string): ((n: number) => string) | undefined {
  const labels: Readonly<Record<string, (n: number) => string>> = {
    projects: m.projects.count,
    sources: m.sources.count,
    translations: m.translations.keys,
    members: m.members.count,
  };
  return Object.hasOwn(labels, key) ? labels[key] : undefined;
}
