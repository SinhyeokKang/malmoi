import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

/**
 * **보안 응답 헤더** (sec-audit 발견 9). 세 파일 어디에도 `headers()`가 없었다.
 *
 * 실질 위험은 통설보다 작다 — XSS 원시체가 0곳이고 세션 쿠키가 `SameSite=Lax`라 iframe에서는
 * 로그아웃 상태로 렌더된다. 남는 실질은 둘이다:
 *
 * - **CSP 부재** — 지금 XSS를 막는 층이 React 이스케이프 **하나**뿐이라, 향후 XSS 하나가 곧 전면 실행이다.
 * - **`Referrer-Policy` 부재 + `/invite/<token>`** — 그 화면에 외부 링크가 **하나 추가되는 순간**
 *   초대 토큰이 `Referer`로 나간다. 지금 외부 링크가 0개인 것을 지키는 가드가 없다.
 *
 * ⚠️ **CSP는 `Report-Only`로 시작한다** (2026-09-09 사용자 판정). Next가 인라인 스타일·스크립트를
 * 넣으므로 enforce를 바로 켜면 화면이 깨질 수 있고 **깨지는 방식이 조용하다.** 나머지 셋은 깨질
 * 여지가 없어 바로 enforce다.
 *
 * ⚠️ **`tsc`는 이 파일의 형태를 못 본다** — `headers()`가 없어도, 오타가 나도 타입은 통과한다.
 * 그래서 설정을 **불러서** 검사한다.
 */
type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

async function rules(): Promise<Rule[]> {
  const fn = nextConfig.headers;
  expect(fn, "next.config.ts에 headers()가 없다").toBeTypeOf("function");
  return (await fn!.call(nextConfig)) as Rule[];
}

const valueOf = (rule: Rule, key: string): string | undefined =>
  rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe("보안 응답 헤더 (sec-audit 9)", () => {
  it("모든 경로에 붙는 규칙이 하나 있다", async () => {
    const all = (await rules()).filter((r) => r.source === "/(.*)");
    expect(all).toHaveLength(1);
  });

  it("깨질 여지가 없는 셋은 enforce다", async () => {
    const [rule] = (await rules()).filter((r) => r.source === "/(.*)");
    expect(valueOf(rule!, "X-Content-Type-Options")).toBe("nosniff");
    // ⚠️ `/invite/<token>` 때문에 이 셋 중 실질이 가장 크다 — 토큰이 URL에 있다.
    expect(valueOf(rule!, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    // `frame-ancestors`는 CSP로만 표현된다 — X-Frame-Options는 그 구식 사본이다.
    expect(valueOf(rule!, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("CSP 본체는 Report-Only다 — enforce로 켜면 조용히 깨질 수 있다", async () => {
    const [rule] = (await rules()).filter((r) => r.source === "/(.*)");
    const report = valueOf(rule!, "Content-Security-Policy-Report-Only");
    expect(report).toBeTypeOf("string");
    expect(report).toContain("default-src 'self'");
    expect(report).toContain("object-src 'none'");
    expect(report).toContain("base-uri 'self'");
    // 폰트는 자사 호스트다 — 서브셋을 `public/fonts/`에서 낸다 (CLAUDE.md).
    expect(report).toContain("font-src 'self'");
    expect(report?.split("; ").find((directive) => directive.startsWith("img-src "))).toBe("img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://*.public.blob.vercel-storage.com");
  });

  /**
   * ⚠️ **Google 로그인은 폼 POST → 302 `accounts.google.com`이다** (audit #75). `form-action`은 폼 제출 뒤의
   * 리다이렉트에도 걸리므로, 이 호스트가 없는 채로 enforce를 켜면 Google 로그인이 **콘솔에만 남고** 멈춘다.
   */
  it("`form-action`이 두 로그인 공급자를 다 연다", async () => {
    const [rule] = (await rules()).filter((r) => r.source === "/(.*)");
    const formAction = valueOf(rule!, "Content-Security-Policy-Report-Only")?.split("; ").find((d) => d.startsWith("form-action "));
    expect(formAction).toBe("form-action 'self' https://github.com https://accounts.google.com");
  });

  it("HSTS와 Permissions-Policy는 enforce다 — 화면을 깨뜨릴 여지가 없다", async () => {
    const [rule] = (await rules()).filter((r) => r.source === "/(.*)");
    // ⚠️ `preload`·`includeSubDomains`는 되돌리기 어려운 결정이라 넣지 않는다 — 브라우저 목록에 박히면 수개월 간다.
    expect(valueOf(rule!, "Strict-Transport-Security")).toBe("max-age=63072000");
    const policy = valueOf(rule!, "Permissions-Policy");
    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "browsing-topics=()"]) {
      expect(policy?.split(", ")).toContain(feature);
    }
  });

  it("enforce 쪽에 `default-src`를 넣지 않는다 — Report-Only와 섞이면 그게 곧 enforce다", async () => {
    const [rule] = (await rules()).filter((r) => r.source === "/(.*)");
    expect(valueOf(rule!, "Content-Security-Policy")).not.toContain("default-src");
  });
});
