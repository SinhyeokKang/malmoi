import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INVITATION_EMAIL_HTML } from "@/lib/invitation-email/template";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
/** 주석을 벗긴다 — 머리 주석이 금지한 낱말을 이름으로 적는다. */
const bare = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

/**
 * **테마가 닿는 자리와 안 닿는 자리** (color-scheme design §3.4 · §3.5 · spec 완료 조건 17·19).
 * 루트 레이아웃 하나가 `<html data-theme>`과 토스트 테마를 싣고, 그 밖 표면(전역 오류 화면 · 초대 메일)은 라이트로 남는다.
 */
describe("루트 레이아웃 — 테마 입구", () => {
  const layout = bare(read("app/layout.tsx"));

  it("`<html data-theme>`을 서버 판정(`getColorScheme`)으로 싣는다 — 인라인 스크립트가 없다", () => {
    expect(layout).toMatch(/import \{ getColorScheme \} from "@\/lib\/color-scheme\/server";/);
    expect(layout).toMatch(/const colorScheme = await getColorScheme\(\);/);
    expect(layout).toMatch(/<html [^>]*data-theme=\{colorScheme\}/);
    expect(layout).not.toMatch(/<script|dangerouslySetInnerHTML/);
  });

  it("토스트가 같은 테마를 받고 sonner 변수를 토큰에 묶는다", () => {
    expect(layout).toMatch(/<Toaster\s+theme=\{colorScheme\}/);
    expect(layout).not.toMatch(/theme="light"/);
    expect(layout).toMatch(/"--normal-bg": "var\(--popover\)"/);
    expect(layout).toMatch(/"--normal-border": "var\(--border\)"/);
    expect(layout).toMatch(/"--normal-text": "var\(--foreground\)"/);
    expect(layout).toMatch(/style=\{SONNER_TOKENS\}/);
    // 설명 글자는 sonner의 `[data-description]` 색을 이겨야 한다 — important 없이는 진다(P2-0 실측).
    expect(layout).toMatch(/description: "text-muted-foreground!"/);
  });
});

describe("테마 밖 표면", () => {
  /** 전역 오류 화면은 루트 레이아웃 밖이고 전역 CSS를 읽지 않는다 — 토큰도 `data-theme`도 없이 브라우저 기본값(라이트)이다. */
  it("`app/global-error.tsx`가 `globals.css`를 import하지 않고 `data-theme`을 달지 않는다", () => {
    const source = bare(read("app/global-error.tsx"));
    expect(source).toMatch(/<html\b/);
    expect(source).not.toMatch(/globals\.css/);
    expect(source).not.toMatch(/data-theme/);
  });

  /** 초대 메일은 라이트 고정이다(spec 비목표) — 메일 클라이언트의 자동 다크 반전을 막는 메타 둘. */
  it("초대 메일이 `color-scheme: light` 메타를 유지한다", () => {
    expect(INVITATION_EMAIL_HTML).toContain('<meta name="color-scheme" content="light">');
    expect(INVITATION_EMAIL_HTML).toContain('<meta name="supported-color-schemes" content="light">');
  });
});
