import { expect } from "vitest";

/** 결과 문구가 실제로 도착한 Alert의 톤·낭독을 소비자 간 같은 계약으로 검증한다. */
export function expectResultAlert(text: string, tone: "warning" | "danger", root: ParentNode = document) {
  const blocks = [...root.querySelectorAll("[data-alert]")].filter(node => node.textContent?.includes(text));
  expect(blocks).toHaveLength(1);
  expect(blocks[0]?.getAttribute("data-alert")).toBe(tone);
  expect(blocks[0]?.getAttribute("role")).toBe(tone === "warning" ? "status" : "alert");
}
