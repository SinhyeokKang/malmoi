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
