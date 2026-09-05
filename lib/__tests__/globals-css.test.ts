import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `text-mono`가 **글꼴까지** 싣는지 텍스트로 본다 (DESIGN §4.1).
 *
 * 2026-09-06까지 `@theme inline`의 `--text-mono`(font-size 토큰)뿐이어서 13px/18px만 실리고 font-family는
 * 안 실렸다 — 키·slug·초대 링크가 전부 13px **sans**로 렌더됐고, 이름이 mono라 아무도 의심하지 않았다
 * (`/doc-check` 1회차). 소비 경로가 유틸 하나인 것이 설계라, 그 유틸이 셋(글꼴·크기·행간)을 다 들어야 한다.
 */
const CSS = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

describe("globals.css — text-mono 유틸", () => {
  const block = /@utility text-mono\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

  it("@utility text-mono 블록이 있다", () => {
    expect(block).not.toBe("");
  });

  it("font-family·font-size·line-height 셋을 함께 싣는다", () => {
    expect(block).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(block).toMatch(/font-size:\s*var\(--mono-size\)/);
    expect(block).toMatch(/line-height:\s*var\(--mono-leading\)/);
  });

  it("font-size 토큰 경로(--text-mono)는 없다 — 소비 경로가 둘이면 하나만 놓쳐도 갈린다", () => {
    expect(CSS).not.toMatch(/^\s*--text-mono/m);
  });

  it("라이트 고정 장치가 그대로다", () => {
    expect(CSS).toContain("@custom-variant dark (&:is(.dark *));");
  });
});
