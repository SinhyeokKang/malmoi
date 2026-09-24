import { vi } from "vitest";
vi.mock("server-only", () => ({}));
for (const [prefix, byte] of [["TOKEN", 71], ["PII", 72]] as const) {
  process.env[`${prefix}_ENCRYPTION_KEYS`] = JSON.stringify({ test: Buffer.alloc(32, byte).toString("base64") });
  process.env[`${prefix}_ENCRYPTION_ACTIVE_KEY_ID`] = "test";
}
process.env.EMAIL_LOOKUP_KEY = Buffer.alloc(32, 73).toString("base64");
process.env.EMAIL_LOOKUP_KEY_ID = "test";

/**
 * Radix Select가 jsdom에 없는 셋을 부른다 (2026-09-13, `ui/select.tsx` 리워크). 없으면 트리거를
 * 한 번 누르는 순간 `hasPointerCapture is not a function`으로 **컴포넌트가 아니라 테스트가** 죽는다.
 *
 * ⚠️ **no-op이라 회귀가 red가 아니라 무반응으로 나온다** — `scrollIntoView`는 아무것도 안 하고
 * `ResizeObserver`는 콜백을 **한 번도 부르지 않는다.** 스크롤 위치나 크기 변화에 기대는 단언을
 * 쓰려면 이 둘을 먼저 진짜로 만들어야 한다.
 *
 * ⚠️ **`Element` 가드가 필요하다** — 이 파일은 기본 `node` 환경의 순수 모듈 테스트에도 로드된다
 * (jsdom은 파일 머리의 `// @vitest-environment jsdom`을 단 파일만 세운다).
 */
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * **jsdom에서만 필요한 보정** — `react-resizable-panels`의 히트 판정을 무력화한다.
 *
 * 그 라이브러리는 document 레벨 `pointerdown`에서 **핸들 rect ± 히트 마진** 안에 포인터가 있으면
 * `preventDefault()` + `stopImmediatePropagation()`을 건다(핸들 밖을 눌렀을 때). jsdom은 모든
 * `getBoundingClientRect()`가 `0×0 @ (0,0)`이고 `user-event`의 포인터 좌표도 `(0,0)`이라, **화면의
 * 모든 클릭이 핸들 위로 판정되어** 그 아래 폼이 통째로 먹통이 된다(`add-surface.test.tsx`에서
 * `#manual-path` 입력이 빈 값으로 남았다).
 *
 * ⚠️ **실제 브라우저에는 없는 조건이다** — 거기서는 rect가 진짜 값이라 8px·16px 스트립 근처에서만
 * 걸린다. 그래서 프로덕션 코드를 비트는 대신 핸들의 rect만 화면 밖으로 민다. **드래그 자체를
 * jsdom에서 검증할 수는 없다** — 그건 `/runtime-test`와 실물 확인이 든다.
 */
if (typeof Element !== "undefined") {
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRectForTests(this: Element): DOMRect {
    if (this.hasAttribute("data-resize-handle")) {
      return { x: -9999, y: -9999, top: -9999, left: -9999, right: -9999, bottom: -9999, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    }
    return rect.call(this);
  };
}
