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

/**
 * **포커스 링이 border와 같은 값이면 보이지 않는다** (2026-09-11 사용자 — 블루 계열로 전환).
 *
 * 그때까지 `--ring`이 `--border`(`hsl(0 0% 89.8%)`)와 **같은 값**이라 흰 배경에서 대비가 1.19:1이었다 —
 * 프리미티브 여덟이 `ring-ring`을 정확히 들고 `focus-ring.test.ts`가 그것을 전수로 세는 동안,
 * **링은 green이면서 눈에 안 보였다.** DESIGN §7이 그 사실을 "약하다"로 적고 호출부가
 * `ring-offset-1`로 덧대는 우회를 들고 있었는데, 고칠 자리는 토큰 하나였다.
 *
 * ⚠️ 그래서 여기서 세는 것은 **값이 무엇인가가 아니라 border와 다른가**다 — 색을 고르는 것은
 * DESIGN의 일이고, 되돌아가면 안 되는 것은 "같아지는 것"이다.
 */
describe("globals.css — 포커스 링", () => {
  const tokenOf = (name: string): string => new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m").exec(CSS)?.[1]?.trim() ?? "";

  it("--ring이 --border와 다르다 — 같으면 링이 green인 채로 안 보인다", () => {
    expect(tokenOf("ring")).not.toBe("");
    expect(tokenOf("border")).not.toBe("");
    expect(tokenOf("ring")).not.toBe(tokenOf("border"));
  });

  /** 무채색으로 되돌아가면 같은 결함이 값만 바꿔 돌아온다 — 파랑 성분이 실재하는지 본다. */
  it("무채색이 아니다", () => {
    const ring = tokenOf("ring");
    const hsl = /hsl\(\s*([\d.]+)\s+([\d.]+)%/.exec(ring);
    const rgb = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/.exec(ring);
    if (hsl) {
      // saturation 0이면 회색이다 — hue는 그때 의미가 없다.
      expect(Number(hsl[2])).toBeGreaterThan(0);
    } else if (rgb) {
      const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      expect(b).toBeGreaterThan(Math.max(r, g));
    } else {
      throw new Error(`--ring 형식을 못 읽었다: ${ring}`);
    }
  });
});

/**
 * **`:root`에 변수만 만들고 `@theme inline` 등록을 빠뜨리면 클래스가 아예 생성되지 않는다.**
 *
 * ⚠️ 8-1b가 그렇게 나갔다 — `bg-auth-canvas`·`from-auth-hero-from`이 **존재하지 않는 유틸**이라
 * 조용히 무시됐고, 배경색·그라데이션·border 셋이 한꺼번에 사라졌다. 오류도 경고도 없다.
 *
 * 그래서 **양방향으로 센다**: 등록된 것이 실재하는가 + `:root`의 색 변수가 전부 등록됐는가.
 */
describe("globals.css — 토큰 등록", () => {
  const theme = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";

  it("두 블록을 찾았다 — 정규식이 조용히 빈 문자열이 되지 않는다", () => {
    expect(theme).not.toBe("");
    expect(root).not.toBe("");
  });

  /**
   * 등록에서 값을 안 가리키면 유틸은 생기지만 **색이 없다** — 위와 증상이 다르고 원인이 같다.
   */
  it("`@theme`의 `--color-*`가 전부 `:root`의 실재 변수를 가리킨다", () => {
    const rootNames = new Set([...root.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    const dangling = [...theme.matchAll(/^\s*(--color-[\w-]+):\s*var\((--[\w-]+)\)/gm)]
      .filter((m) => !rootNames.has(m[2] ?? ""))
      .map((m) => m[1]);
    expect(dangling).toEqual([]);
  });

  /**
   * ⚠️ **등록하지 않는 변수는 이름으로 고정한다.** 넷 다 유틸 클래스의 재료가 아니다 —
   * `--radius`는 `--radius-*`의 `calc()` 입력, mono 둘은 `@utility text-mono`가 직접 읽고,
   * `--signin-dot`은 Canvas가 `getComputedStyle`로 읽는다(유틸을 못 받는다).
   * 목록에 이름을 더하려면 **그 변수를 클래스로 안 쓰는 이유**가 함께 있어야 한다.
   */
  it("`:root`의 색 변수가 전부 등록됐다 — 안 하면 클래스가 생성되지 않는다", () => {
    const UNREGISTERED = new Set(["--radius", "--mono-size", "--mono-leading", "--signin-dot"]);
    const registered = new Set(
      [...theme.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1] ?? ""),
    );
    const missing = [...root.matchAll(/^\s*(--[\w-]+):/gm)]
      .map((m) => m[1] ?? "")
      .filter((name) => !UNREGISTERED.has(name) && !registered.has(name));
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ **8-2가 `--auth-canvas`를 `--canvas`로 옮겼다** — 셸의 페이지 배경이 같은 값이라, 이름에
   * `auth`가 남으면 앱 셸이 "auth" 토큰을 쓰게 되고 값의 집이 둘로 갈릴 압력이 생긴다.
   */
  it("캔버스 토큰의 이름이 화면에 매이지 않는다", () => {
    expect(root).toMatch(/^\s*--canvas:/m);
    expect(CSS).not.toContain("--auth-canvas");
  });
});

/**
 * **본문이 grayscale 안티앨리어싱으로 그려진다** (2026-09-25 사용자 — 보관 행의 회색 이름·배지가 굵어 보였다).
 * 명시가 없으면 macOS 브라우저의 기본 렌더링이 획을 두껍게 그려, 같은 500이 밝은 회색에서 한 단계 무겁게 읽힌다.
 */
describe("globals.css — 글꼴 렌더링", () => {
  const body = /\bbody\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

  it("body가 antialiased를 든다", () => {
    expect(body).not.toBe("");
    expect(body).toMatch(/@apply[^;]*\bantialiased\b/);
  });
});
