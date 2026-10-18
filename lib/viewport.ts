import type { Viewport } from "next";

/**
 * 요청 UA → 루트 viewport. **잎이다 — 타입 import 하나뿐**이라 레이아웃 밖에서 그대로 테스트한다.
 *
 * ⚠️ **iOS만 `maximumScale: 1`이다** (2026-10-18 사용자 — 입력 글자 크기는 건드리지 않는다). iOS Safari는 16px 미만 입력에 포커스가 가면
 * 화면을 확대한다(검색 Dialog가 열리며 첫 포커스를 입력에 줄 때 "살짝 핀치"로 보였다 — 필드는 `text-sm` 14·`text-xs` 13).
 * iOS 10+ Safari는 사용자 핀치에는 `maximum-scale`을 무시하고 포커스 자동 확대만 막는다. **Android Chrome은 사용자 핀치까지 막으므로**
 * (WCAG 1.4.4) 전역으로 걸지 않는다.
 * ⚠️ 받아들인 대가: 인앱 브라우저(WKWebView — 카카오톡·인스타그램 등)는 `ignoresViewportScaleLimits`가 기본 꺼짐이라 그 안에서는 핀치도
 * 막힐 수 있다. iPadOS 데스크톱 모드는 UA가 Mac과 같아 서버가 가르지 못하므로 판정에 넣지 않는다(그 모드의 포커스 확대는 남는다).
 * ⚠️ `userScalable: false`는 어떤 경우에도 내지 않는다.
 * ⚠️ `interactiveWidget`은 모든 UA에 둔다 — 키보드가 `dvh`를 줄여 시트의 sticky 푸터가 서게 한다(D20, Chrome·Firefox Android. iOS는 무시).
 */
const IOS = /\b(iPhone|iPad|iPod)\b/;

export function viewportFor(userAgent: string | null): Viewport {
  const base: Viewport = { interactiveWidget: "resizes-content" };
  return userAgent !== null && IOS.test(userAgent) ? { ...base, maximumScale: 1 } : base;
}
