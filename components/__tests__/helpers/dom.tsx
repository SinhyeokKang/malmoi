import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vitest";

import { MessagesProvider } from "@/components/i18n/messages-provider";
import type { UiLocale } from "@/lib/i18n/locales";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/**
 * `uiLocale`을 주면 루트 레이아웃처럼 그 언어의 provider로 감싼다 — 안 주면 provider 없이 그린다(`useMessages()`의 기본값 en).
 * ⚠️ ko·es 사전은 비동기 로더가 운반하므로(첫 렌더가 suspend한다) 그려질 때까지 기다린다.
 */
export async function render(ui: ReactNode, { uiLocale }: { uiLocale?: UiLocale } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const wrap = (node: ReactNode) => (uiLocale === undefined ? node : <MessagesProvider uiLocale={uiLocale}>{node}</MessagesProvider>);
  await act(async () => root.render(wrap(ui)));
  for (let tries = 0; uiLocale !== undefined && container.childNodes.length === 0 && tries < 50; tries++) {
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
