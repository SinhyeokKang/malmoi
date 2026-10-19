import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **랜딩 배경 한 장** (landing-kv-background R1·R2·R4·R12). 랜딩은 async 서버 컴포넌트(세션·사전)라 DOM으로 세우지 않고
 * 소스로 센다 — 래퍼가 하나이고, 그라디언트가 그 첫 자식으로 콘텐츠 높이 전체를 덮고, 내용 섹션이 위치 지정돼 있는지.
 * 색 리터럴 0은 `visual-system.test.ts`가 전 소스로 센다.
 */
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
/** JSX 속성으로 선 래퍼만 센다 — 주석의 `[data-landing-kv]`는 세지 않는다. */
const WRAPPER = /\bdata-landing-kv(?=[\s=>])/g;

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });

describe("랜딩 배경 — 구조", () => {
  const page = read("app/page.tsx");

  it("래퍼가 `app/page.tsx`에 하나이고 첫 자식이 콘텐츠 높이 전체의 그라디언트다", () => {
    expect([...page.matchAll(WRAPPER)]).toHaveLength(1);
    expect(page).toMatch(
      /<div data-landing-kv="" className="relative">\s*<div aria-hidden className="absolute inset-0 bg-gradient-to-b from-auth-hero-from to-auth-hero-to" \/>/,
    );
  });

  /**
   * R3 — 둘째 자식이 스크롤러 한 화면짜리 sticky 캔버스다. 높이와 같은 값의 음수 margin이 스테이지의 `--landing-stage-h`라 흐름에서 자리를 차지하지 않는다.
   * 98 폴백은 JS 전에만 쓰인다(`stage.tsx` 주석).
   */
  it("둘째 자식이 `follow=\"scroller\"` 점 격자이고 높이·음수 margin이 `--landing-stage-h`다", () => {
    expect(page).toMatch(
      /<div aria-hidden className="absolute inset-0 bg-gradient-to-b from-auth-hero-from to-auth-hero-to" \/>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<DotField\s+follow="scroller"\s+className="pointer-events-none sticky top-0 block w-full h-\[var\(--landing-stage-h,calc\(100svh-98px\)\)\] -mb-\[var\(--landing-stage-h,calc\(100svh-98px\)\)\]"\s*\/>/,
    );
    expect([...page.matchAll(/<DotField\b/g)]).toHaveLength(1);
  });

  /** 로그인 KV는 `follow`를 넘기지 않는다 — 넘기면 스크롤러 경로를 찾으러 가고 포인터를 받지 않는다. */
  it("`/signin`의 점 격자는 `follow` 없이 선다", () => {
    const auth = read("components/signin/auth-layout.tsx");
    const uses = [...auth.matchAll(/<DotField\b[^>]*\/>/g)].map((match) => match[0]);
    expect(uses).toHaveLength(1);
    expect(uses[0]).not.toMatch(/\bfollow\b/);
  });

  /** 래퍼가 히어로와 스테이지(마무리 CTA 포함)를 함께 감싼다 — 닫는 태그가 히어로 뒤로 올라가면 그라디언트가 히어로 길이에서 끝난다. */
  it("래퍼가 히어로와 `<Stage>`를 둘 다 감싼다", () => {
    const close = page.match(/<\/div>\s*<\/PublicShell>/)?.index ?? -1;
    const order = [page.indexOf("data-landing-kv"), page.indexOf('aria-labelledby="landing-hero"'), page.indexOf("<Stage"), close];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 히어로 섹션과 `<Stage>` 사이에 래퍼를 닫는 `</div>`가 없다 — 섹션을 닫은 바로 다음이 스테이지다.
    expect(page.slice(page.indexOf('aria-labelledby="landing-hero"'), page.indexOf("<Stage"))).toMatch(/<\/section>\s*$/);
  });

  it("랜딩만 셸 `kv` 갈래를 쓴다", () => {
    expect(page).toMatch(/<PublicShell\b[^>]*\bkv\b/);
  });

  /** R4 — 위치 지정된 층(그라디언트·캔버스)보다 나중에 그려져야 내용이 그 위에 온다. */
  it("히어로와 마무리 CTA 섹션이 `relative`다", () => {
    expect(page).toMatch(/<section aria-labelledby="landing-hero" className="relative [^"]*"/);
    expect(page).toMatch(/<section aria-labelledby="landing-closing" className="relative [^"]*"/);
  });

  it("다른 공개 화면과 컴포넌트에는 래퍼가 없다", () => {
    const others = ["app/docs", "app/privacy", "app/changelog", "app/signin", "components"].flatMap(walk);
    expect(others.length).toBeGreaterThan(50);
    expect(others.filter((file) => read(file).match(WRAPPER) !== null)).toEqual([]);
  });
});
