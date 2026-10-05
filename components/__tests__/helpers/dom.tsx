import { act, isValidElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vitest";

import { MessagesProvider } from "@/components/i18n/messages-provider";
import type { UiLocale } from "@/lib/i18n/locales";
import type { TimeZone } from "@/lib/time-zone/zones";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/**
 * **서버 컴포넌트(async)를 그대로 받는다** — 서버 컴포넌트는 `await getMessages()`를 하는 async 함수라 클라이언트 루트가 못 그린다.
 * 최상위 요소가 async 함수 컴포넌트이거나 호출 결과(Promise)면 풀어서 그 결과 트리를 그린다. 안쪽 async는 풀지 않는다.
 */
async function resolveServer(input: ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const node = await input;
  // ⚠️ async 함수만 직접 부른다 — 훅을 쓰는 평범한 컴포넌트를 렌더 밖에서 부르면 "Invalid hook call"이다.
  if (isValidElement(node) && typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    return (await (node.type as (props: unknown) => Promise<ReactNode>)(node.props));
  }
  return node;
}

/**
 * `uiLocale`(또는 `timeZone`)을 주면 루트 레이아웃처럼 provider로 감싼다 — 둘 다 안 주면 provider 없이 그린다(`useMessages()`의 기본값 en · UTC).
 * ⚠️ ko·es 사전은 비동기 로더가 운반하므로(첫 렌더가 suspend한다) 그려질 때까지 기다린다. **그릴 사전을 먼저 import해 모듈 캐시를 데운다** — 변환·로드는
 * 느린 러너·병렬 부하에서 아래 틱 50번(수십 ms)을 넘기고, 그러면 빈 컨테이너로 돌아와 다음 단언이 "Missing element"로 죽는다(CI에서만 red였다).
 */
export async function render(input: ReactNode | Promise<ReactNode>, { uiLocale, timeZone }: { uiLocale?: UiLocale; timeZone?: TimeZone } = {}) {
  const ui = await resolveServer(input);
  if (uiLocale === "ko") await import("@/messages/ko");
  if (uiLocale === "es") await import("@/messages/es");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const wrapped = uiLocale !== undefined || timeZone !== undefined;
  const wrap = (node: ReactNode) => (wrapped ? <MessagesProvider uiLocale={uiLocale ?? "en"} timeZone={timeZone ?? "UTC"}>{node}</MessagesProvider> : node);
  await act(async () => root.render(wrap(ui)));
  for (let tries = 0; wrapped && container.childNodes.length === 0 && tries < 50; tries++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove(); });
  return { container, rerender: async (next: ReactNode) => { await act(async () => root.render(wrap(next))); } };
}

export function find<T extends Element>(container: ParentNode, selector: string): T {
  const node = container.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

export async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing native value setter");
  await act(async () => { setter.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}

export async function key(element: Element, key: string, options: KeyboardEventInit = {}) {
  await act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); });
}
