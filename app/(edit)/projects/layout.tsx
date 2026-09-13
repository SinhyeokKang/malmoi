import type { ReactNode } from "react";

/** [slug] 이하도 이 층을 지나므로 패널·래퍼를 추가하면 기존 화면의 레이아웃이 중첩된다. */
export default function ProjectsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return <>{children}{modal}</>;
}
