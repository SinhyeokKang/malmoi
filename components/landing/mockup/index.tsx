import type { ReactNode } from "react";

import { AppFrame } from "./app-frame";
import { PreviewModal, ResultModal } from "./publish";
import { TranslationsView } from "./translations";

/**
 * 스테이지가 교차시키는 씬 다섯(DESIGN §6.615) — ① 번역 화면 ② `fr` 채우기 ③ 저장 → Publish 배지 ④ 미리보기 ⑤ PR 열림.
 *
 * ⚠️ **서버 컴포넌트다** — 클라이언트 `Stage`에 `scenes`로 넘긴다. 사전 전체를 클라이언트 청크에 싣지 않으려는 것이고,
 * 목업이 스크롤에 반응하는 자리(타이핑 텍스트 · `data-badge`)는 스테이지가 DOM에 직접 쓴다.
 */
export function mockupScenes(): readonly [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode] {
  return [
    <AppFrame key="1"><TranslationsView phase="missing" /></AppFrame>,
    <AppFrame key="2"><TranslationsView phase="typing" /></AppFrame>,
    <AppFrame key="3"><TranslationsView phase="saving" /></AppFrame>,
    <AppFrame key="4" overlay={<PreviewModal />}><TranslationsView phase="saved" /></AppFrame>,
    <AppFrame key="5" overlay={<ResultModal />}><TranslationsView phase="saved" /></AppFrame>,
  ];
}
