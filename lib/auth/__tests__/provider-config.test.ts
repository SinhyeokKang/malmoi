import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `auth.ts`를 **텍스트로** 검사한다. 그 파일을 import하면 `NextAuth()`가 평가돼 테스트가 환경변수와
 * 프레임워크 배선을 끌고 오므로, 여기서 확인할 성질(보안 플래그의 **부재**)에는 텍스트가 맞다 —
 * `prisma/__tests__/schema-contract.test.ts`와 같은 형태다.
 *
 * ⚠️ **`allowDangerousEmailAccountLinking`의 부재가 이 단계의 계정 병합 방어선 전부다.**
 * Auth.js 어댑터는 이메일이 같은 User가 있고 그 provider의 Account가 없으면 기본으로
 * `OAuthAccountNotLinked`를 던진다(`@auth/core`의 handle-login). 그 옵션을 켜는 순간 **같은
 * 이메일이라는 이유만으로 계정이 합쳐지고**, ARCHITECTURE §6.2.1가 그걸 "불편이 아니라 계정 탈취"라 부른다.
 * 명시적 연결은 4단계(`github-connect`)다.
 */

const AUTH_TS = readFileSync(
  fileURLToPath(new URL("../../../auth.ts", import.meta.url)),
  "utf8",
);

describe("auth.ts — 자동 계정 병합을 켜지 않는다", () => {
  it("allowDangerousEmailAccountLinking에 값을 대입하지 않는다", () => {
    // ⚠️ 단어 자체를 금지하지 않는다 — **왜 켜지 않는지** 적은 주석이 그 단어를 담아야
    // 다음 사람이 그것을 grep으로 찾는다. 위험한 것은 대입이다.
    expect(AUTH_TS).not.toMatch(/allowDangerousEmailAccountLinking\s*:/);
  });

  it("그 옵션을 켜지 않는 이유가 파일에 적혀 있다", () => {
    expect(AUTH_TS).toContain("allowDangerousEmailAccountLinking");
  });
});

describe("auth.ts — DB 세션과 provider 둘", () => {
  it("세션 전략이 database다 — JWT는 권한 회수가 최대 24시간 지연됐다 (ARCHITECTURE §6.00 ④)", () => {
    expect(AUTH_TS).toMatch(/strategy:\s*"database"/);
    expect(AUTH_TS).not.toMatch(/strategy:\s*"jwt"/);
  });

  it("세션이 슬라이딩한다 — updateAge를 명시한다 (maxAge와 같으면 한 번도 연장되지 않는다)", () => {
    expect(AUTH_TS).toMatch(/updateAge:\s*60 \* 60\b/);
  });

  it("session 콜백이 허용 목록(publicSession)으로 새 객체를 만든다 — 입력 행에는 sessionToken이 있다", () => {
    expect(AUTH_TS).toContain("publicSession(");
    expect(AUTH_TS).not.toMatch(/session\.user\.id\s*=/);
  });

  it("signIn이 기존 사용자의 이메일을 현재 검증 주소로 맞춘다 — 판정은 planEmailRefresh다", () => {
    expect(AUTH_TS).toContain("refreshVerifiedEmail(");
    expect(AUTH_TS).toContain("freshVerifiedEmail(");
  });

  it("어댑터가 배선돼 있다", () => {
    expect(AUTH_TS).toContain("credentialAdapter(");
  });

  it("GitHub과 Google 둘 다 등록돼 있다 — provider가 하나면 계정 병합 경로를 검증할 수 없다", () => {
    expect(AUTH_TS).toContain("GitHub");
    expect(AUTH_TS).toContain("Google");
  });

  it("검증된 이메일 판정을 지난다", () => {
    expect(AUTH_TS).toContain("verifiedEmailFrom");
  });

  it("세션에 실리는 것은 user.id다 — GitHub 핸들(login)이 아니다", () => {
    // DB 세션에서는 session 콜백에 `token`이 오지 않고 `user`가 온다. 핸들을 실어 나르던
    // jwt 콜백이 사라지므로 `session.user.login`을 읽는 코드가 전부 거짓이 된다.
    expect(AUTH_TS).not.toContain("token[\"login\"]");
    expect(AUTH_TS).not.toContain("session.user.login");
  });
});

/**
 * 두 가로채기의 배타성은 **구조가 아니라 순서와 쿠키 정리가 만든다** (ARCHITECTURE "계정 병합").
 *
 * ⚠️ **`session-revocation/http.ts`의 intent 판정이 쿠키 셋의 OR이라 암호적 결합이 없다.** 회수를
 * 중단한 사용자가 곧바로 병합을 시작하면 회수가 그 callback을 먹고 Location을
 * `/account?sessionRevocation=invalid`로 **덮는다** — 사용자에겐 병합 버튼이 엉뚱한 화면을 낸
 * 것으로 보인다. 그래서 계약 셋을 소스로 고정한다.
 */
describe("auth.ts — 회수와 병합이 서로를 먹지 않는다", () => {
  it("래핑 순서는 회수가 바깥, 병합이 안쪽이다", () => {
    expect(AUTH_TS).toMatch(/withRevocation\(request,\s*\(\)\s*=>\s*withConnect\(request,\s*\(\)\s*=>\s*withLoginLink\(/);
    expect(AUTH_TS).not.toMatch(/withLoginLink\([^)]*withRevocation\(/);
  });

  it("`authorizeRevocation`이 signIn 콜백의 첫 줄이고 병합 판정이 그 뒤다", () => {
    const callback = /async signIn\(\{[\s\S]*?\n    \}/.exec(AUTH_TS)?.[0] ?? "";
    expect(callback).toContain("authorizeRevocation(");
    expect(callback).toContain("authorizeLoginLink(");
    expect(callback.indexOf("authorizeRevocation(")).toBeLessThan(callback.indexOf("authorizeConnect("));
    expect(callback.indexOf("authorizeConnect(")).toBeLessThan(callback.indexOf("authorizeLoginLink("));
    expect(callback).toContain("freshVerifiedEmail(account.provider, profile)");
    expect(callback.indexOf("authorizeRevocation(")).toBeLessThan(callback.indexOf("authorizeLoginLink("));
    // 이메일 검사·갱신보다도 앞이다 — 회수 왕복은 로그인이 아니다.
    expect(callback.indexOf("authorizeRevocation(")).toBeLessThan(callback.indexOf("refreshVerifiedEmail("));
  });

  it("state 쿠키 스코프를 두 가로채기에서 함께 읽는다", () => {
    expect(AUTH_TS).toMatch(/revocationAuthCookies\(\)\s*\?\?\s*connectAuthCookies\(\)\s*\?\?\s*linkAuthCookies\(\)/);
  });
});
