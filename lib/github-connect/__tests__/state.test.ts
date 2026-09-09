import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { signState, stateCookieName, stateCookieNames, verifyState } from "../state";

/**
 * OAuth state 서명·검증 (design §3.1·§4). **I/O가 없다** — nonce 생성과 쿠키 쓰기는 껍데기가 하고,
 * 여기서는 서명·대조·만료만 판정한다. `secret`을 인자로 받는 것이 그 조건이다: 함수 안에서
 * `requireEnv("AUTH_SECRET")`을 부르면 순수가 아니고 이 테스트가 환경변수를 요구하게 된다.
 *
 * ⚠️ **state는 쿠키와 쿼리 양쪽에 있어야 한다.** 쿼리만 보면 CSRF이고, 쿠키만 보면 GitHub이
 * 돌려주는 값과 대조할 것이 없다. 그래서 쿠키가 서명된 payload를 들고 쿼리가 nonce만 든다.
 *
 * ⚠️ **목적지는 쿠키에서 온다.** GitHub이 돌려주는 쿼리에서 읽으면 공격자가 목적지를 정한다.
 *
 * ⚠️ **`dest`가 갈래 셋이다** (design §3.6 + 6b-4): 설정 화면(`{kind:"settings", slug}`) · 생성 화면
 * (`{kind:"new"}`) · 계정 화면(`{kind:"account"}`). 뒤의 둘은 **사용자 축이라 slug가 없다** (SAAS §7.7).
 * 생성 경로에는 프로젝트가 없어 slug가 그 역할을 겸할 수 없다. 갈래를 **서명 안에** 두는 이유는
 * 쿼리로 실으면 공격자가 착지를 정해 open redirect 판정이 필요해지기 때문이다.
 */

const SECRET = "test-secret-0123456789abcdef";
const NOW = new Date("2026-09-06T00:00:00.000Z");
const EXPIRES = new Date("2026-09-06T00:10:00.000Z");

function sign(over: Partial<Parameters<typeof signState>[0]> = {}): string {
  return signState({
    userId: "user-1",
    dest: { kind: "settings", slug: "acme" },
    nonce: "nonce-1",
    expiresAt: EXPIRES,
    secret: SECRET,
    ...over,
  });
}

function verify(over: Partial<Parameters<typeof verifyState>[0]> = {}) {
  return verifyState({
    cookie: sign(),
    query: "nonce-1",
    userId: "user-1",
    now: NOW,
    secret: SECRET,
    ...over,
  });
}

describe("signState — 결정적이고 payload를 그대로 들고 있다", () => {
  it("같은 입력이면 같은 문자열이다 — 쿠키 값이 요청마다 흔들리면 대조가 불가능하다", () => {
    expect(sign()).toBe(sign());
  });

  it("dest의 slug가 다르면 다른 서명이다", () => {
    expect(sign({ dest: { kind: "settings", slug: "acme" } })).not.toBe(
      sign({ dest: { kind: "settings", slug: "other" } }),
    );
  });

  it("갈래가 다르면 다른 서명이다 — settings와 new가 같은 쿠키로 통하지 않는다", () => {
    expect(sign({ dest: { kind: "settings", slug: "acme" } })).not.toBe(sign({ dest: { kind: "new" } }));
  });

  it("계정 갈래도 따로 서명된다 — new와 account가 같은 쿠키로 통하지 않는다 (6b-4)", () => {
    expect(sign({ dest: { kind: "account" } })).not.toBe(sign({ dest: { kind: "new" } }));
  });

  it("secret이 다르면 다른 서명이다 — 서명이 실제로 secret을 쓴다", () => {
    expect(sign({ secret: SECRET })).not.toBe(sign({ secret: `${SECRET}x` }));
  });
});

describe("verifyState — 정상 왕복", () => {
  it("쿠키와 쿼리의 nonce가 같고 서명·만료·사용자가 맞으면 ok이고 dest를 준다", () => {
    expect(verify()).toEqual({ status: "ok", dest: { kind: "settings", slug: "acme" } });
  });

  it("dest는 **쿠키에서** 온다 — 쿼리에 무엇이 오든 목적지는 서명된 값이다", () => {
    const cookie = sign({ dest: { kind: "settings", slug: "signed-slug" } });
    expect(verify({ cookie, query: "nonce-1" })).toEqual({
      status: "ok",
      dest: { kind: "settings", slug: "signed-slug" },
    });
  });

  it("생성 경로의 dest는 slug가 없다 — 프로젝트 없이 연결이 성립한다 (design §3.6)", () => {
    const cookie = sign({ dest: { kind: "new" } });
    expect(verify({ cookie, query: "nonce-1" })).toEqual({ status: "ok", dest: { kind: "new" } });
  });

  /**
   * `/account`도 사용자 축이라 slug가 없다 (SAAS §7.7). **생성 경로와 갈래를 합치지 않는 이유는
   * 착지가 다르기 때문**이다 — 합치면 계정 화면에서 연결을 누른 사람이 `/projects/new`에 떨어진다.
   */
  it("계정 경로의 dest도 slug가 없다 — 사용자 축이다 (6b-4)", () => {
    const cookie = sign({ dest: { kind: "account" } });
    expect(verify({ cookie, query: "nonce-1" })).toEqual({ status: "ok", dest: { kind: "account" } });
  });
});

describe("verifyState — state-mismatch (대조할 것이 없거나 서명이 안 맞다)", () => {
  it("쿠키가 없으면 state-mismatch다 — 없음을 통과로 읽지 않는다 (fail-closed)", () => {
    expect(verify({ cookie: null })).toEqual({ status: "state-mismatch" });
    expect(verify({ cookie: undefined })).toEqual({ status: "state-mismatch" });
    expect(verify({ cookie: "" })).toEqual({ status: "state-mismatch" });
  });

  it("쿼리 nonce가 없거나 다르면 state-mismatch다 — CSRF 방어의 본체다", () => {
    expect(verify({ query: null })).toEqual({ status: "state-mismatch" });
    expect(verify({ query: undefined })).toEqual({ status: "state-mismatch" });
    expect(verify({ query: "nonce-2" })).toEqual({ status: "state-mismatch" });
  });

  it("secret이 다르면 state-mismatch다 — 남이 만든 쿠키는 통과하지 못한다", () => {
    expect(verify({ cookie: sign({ secret: "attacker-secret" }) })).toEqual({
      status: "state-mismatch",
    });
  });

  it("쿠키 문자열을 한 글자만 바꿔도 state-mismatch다", () => {
    const cookie = sign();
    const mutated = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;
    expect(verify({ cookie: mutated })).toEqual({ status: "state-mismatch" });
  });

  it("쿠키가 서명 형태가 아니면 state-mismatch다 — 파싱 실패로 던지지 않는다", () => {
    for (const cookie of ["garbage", "a.b.c", "....", "eyJhIjoxfQ"]) {
      expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
    }
  });

  it("payload를 바꾸고 서명을 그대로 두면 state-mismatch다 — 서명 대상이 payload 전체다", () => {
    // ⚠️ 이 케이스만 인코딩 형태(`<base64url(JSON)>.<서명>`)에 의존한다. 그 결합을 감수하는 이유는
    // "서명을 재사용한 payload 교체"가 이 함수가 막아야 하는 유일한 실제 공격이기 때문이다.
    const cookie = sign({ dest: { kind: "settings", slug: "acme" } });
    const dot = cookie.lastIndexOf(".");
    const payload = cookie.slice(0, dot);
    const signature = cookie.slice(dot + 1);
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(decoded).toMatchObject({
      userId: "user-1",
      dest: { kind: "settings", slug: "acme" },
      nonce: "nonce-1",
    });

    const forged = Buffer.from(
      JSON.stringify({ ...(decoded as Record<string, unknown>), dest: { kind: "settings", slug: "victim" } }),
      "utf8",
    ).toString("base64url");
    expect(verify({ cookie: `${forged}.${signature}` })).toEqual({ status: "state-mismatch" });
  });
});

describe("verifyState — state-expired / wrong-user", () => {
  it("만료 시각 정각은 이미 만료다 — 유효 구간을 만료 이전까지로 닫는다", () => {
    expect(verify({ now: EXPIRES })).toEqual({ status: "state-expired" });
  });

  it("만료 1ms 전은 통과한다", () => {
    expect(verify({ now: new Date(EXPIRES.getTime() - 1) })).toEqual({
      status: "ok",
      dest: { kind: "settings", slug: "acme" },
    });
  });

  it("세션이 바뀐 채 돌아온 callback은 wrong-user다 — 같은 브라우저에서 계정을 갈아탄 경우", () => {
    expect(verify({ userId: "user-2" })).toEqual({ status: "wrong-user" });
  });

  it("만료가 wrong-user보다 앞이다 — 만료된 state가 누구 것이었는지 말하지 않는다", () => {
    // `planInvitationAccept`가 만료를 이메일 대조보다 앞에 둔 것과 같은 축이다.
    expect(verify({ now: EXPIRES, userId: "user-2" })).toEqual({ status: "state-expired" });
  });

  it("서명 검사가 만료·사용자 검사보다 앞이다 — 위조된 쿠키의 내용은 읽을 가치가 없다", () => {
    const forged = sign({ secret: "attacker-secret", userId: "user-2", expiresAt: NOW });
    expect(verify({ cookie: forged, now: EXPIRES, userId: "user-2" })).toEqual({
      status: "state-mismatch",
    });
  });
});

describe("빈 secret을 거부한다 — 설정 오류를 거부로 위장하지 않는다", () => {
  /**
   * `createHmac("sha256", "")`는 던지지 않고 동작한다. 빈 키로 만든 서명은 **누구나 재현할 수 있어**
   * `verifyState`가 위조 쿠키를 통과시키고, 공격자가 `slug`와 `userId`를 정한 state로 callback에
   * 들어온다. `requireEnv`가 빈 문자열을 던져 정상 경로는 막혀 있지만, 이 층이 그것에 의존하면서
   * 스스로 검사하지 않으면 호출부의 실수 하나로 방어가 통째로 사라진다 — `checkBearer`가
   * `expected === ""`를 `not-configured`로 가른 것과 같은 판단이다 (`lib/push/auth.ts`).
   *
   * ⚠️ **`state-mismatch`로 접지 않고 던진다.** 접으면 설정 오류가 "다시 눌러 주세요"로 위장돼
   * 사용자가 같은 버튼을 무한히 누른다 — POSTMORTEM 2026-09-06("장애를 정상으로 읽었다")과 같은 축이다.
   */
  it("signState가 빈 secret에 던진다 — 위조 가능한 쿠키를 내보내지 않는다", () => {
    expect(() => sign({ secret: "" })).toThrow();
  });

  it("verifyState가 빈 secret에 던진다 — 위조 쿠키를 통과시키지 않는다", () => {
    expect(() => verify({ secret: "" })).toThrow();
  });

  it("빈 secret으로 서명한 쿠키가 빈 secret 검증을 통과하지 못한다 — 두 쪽 다 막혀야 한다", () => {
    // 한쪽만 막으면 다른 쪽이 그 구멍을 그대로 연다.
    expect(() => verifyState({
      cookie: "any.thing",
      query: "nonce-1",
      userId: "user-1",
      now: NOW,
      secret: "",
    })).toThrow();
  });

  it("공백 한 칸짜리 secret은 유효한 키다 — 빈 문자열만 거른다 (`requireEnv`와 같은 기준)", () => {
    expect(() => sign({ secret: " " })).not.toThrow();
  });
});

describe("옛 payload 모양은 거부된다 — 배포 직후 10분의 창을 의도한다", () => {
  /**
   * T6이 `StatePayload.slug`를 `dest`로 바꿨다 (design §3.6). **진행 중인 연결 왕복은 전부
   * `state-mismatch`가 된다** — 10분 만료라 그 창의 사용자는 버튼을 다시 누르면 되고, 관대하게
   * 받아 주면 갈래가 둘인 착지 판정에 "slug가 있으면 설정"이라는 세 번째 규칙이 영구히 남는다.
   *
   * ⚠️ **이 케이스만 서명 규칙(라벨·인코딩)을 복제한다.** 유효하게 서명된 **옛 모양** 쿠키를
   * 만들어야 하고, 그것은 `signState`로는 만들 수 없다 — 위의 "payload 교체" 케이스가 인코딩에
   * 의존하는 것과 같은 이유로 감수한다. 라벨이 바뀌면 이 테스트가 먼저 red가 된다.
   */
  function signRaw(payload: unknown): string {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const mac = createHmac("sha256", SECRET)
      .update(`malmoi-github-state.${encoded}`, "utf8")
      .digest("base64url");
    return `${encoded}.${mac}`;
  }

  it("서명 규칙 복제가 실제로 맞다 — 틀리면 아래 케이스가 공허하게 통과한다", () => {
    // 새 모양을 이 함수로 서명하면 `signState`와 바이트 단위로 같아야 한다.
    expect(
      signRaw({
        userId: "user-1",
        dest: { kind: "settings", slug: "acme" },
        nonce: "nonce-1",
        exp: EXPIRES.getTime(),
      }),
    ).toBe(sign());
  });

  it("`{slug}` 모양은 서명이 맞아도 state-mismatch다", () => {
    const cookie = signRaw({ userId: "user-1", slug: "acme", nonce: "nonce-1", exp: EXPIRES.getTime() });
    expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
  });

  it("dest가 객체가 아니면 state-mismatch다", () => {
    for (const dest of ["acme", 1, null, [], true]) {
      const cookie = signRaw({ userId: "user-1", dest, nonce: "nonce-1", exp: EXPIRES.getTime() });
      expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
    }
  });

  /**
   * ⚠️ **갈래를 늘리는 방향은 안전하다** — 6b-4가 `account`를 더할 때 진행 중인 왕복(옛 쿠키 둘)이
   * 깨지면 배포 직후 10분 동안 연결이 100% 실패하고, 증상이 "버튼을 눌렀는데 아무 일도 안 났다"다.
   * `{slug}` 모양을 일부러 거부하는 것과 **방향이 반대**라 따로 센다.
   */
  it("갈래를 늘려도 옛 쿠키 둘은 그대로 파싱된다 — 진행 중인 왕복을 깨지 않는다 (6b-4)", () => {
    for (const dest of [{ kind: "new" }, { kind: "settings", slug: "acme" }]) {
      const cookie = signRaw({ userId: "user-1", dest, nonce: "nonce-1", exp: EXPIRES.getTime() });
      expect(verify({ cookie }), JSON.stringify(dest)).toEqual({ status: "ok", dest });
    }
  });

  it("모르는 kind는 state-mismatch다 — 갈래를 늘리면 옛 쿠키가 아니라 새 코드가 답한다", () => {
    const cookie = signRaw({
      userId: "user-1",
      dest: { kind: "elsewhere", slug: "acme" },
      nonce: "nonce-1",
      exp: EXPIRES.getTime(),
    });
    expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
  });

  it("settings인데 slug가 없으면 state-mismatch다 — 착지 경로가 `/projects/undefined/settings`가 되지 않게", () => {
    for (const slug of [undefined, "", 1, null]) {
      const cookie = signRaw({
        userId: "user-1",
        dest: { kind: "settings", slug },
        nonce: "nonce-1",
        exp: EXPIRES.getTime(),
      });
      expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
    }
  });
});

describe("stateCookieName — __Host- 접두는 https에서만", () => {
  /**
   * ⚠️ **`__Host-` 접두는 `Secure` 속성을 요구한다.** Chromium·Firefox는 localhost를 예외로 허용하지만
   * **Safari는 http에서 Secure 쿠키를 저장하지 않아** 로컬 callback이 항상 `state-mismatch`가 된다 —
   * 원인이 "쿠키가 없다"로 보여 서명·nonce를 의심하게 만드는 부류의 함정이다.
   *
   * `lib/auth/cookie.ts`가 `authjs.session-token`과 `__Secure-` 접두 둘을 프로토콜로 가르는 것과 같다.
   */
  it("https에서는 __Host- 접두가 붙는다 — 하위 도메인·경로 고정이 공짜로 따라온다", () => {
    expect(stateCookieName(true).startsWith("__Host-")).toBe(true);
  });

  it("http에서는 접두가 없다 — Safari가 로컬에서 쿠키를 버리지 않게", () => {
    expect(stateCookieName(false).startsWith("__Host-")).toBe(false);
  });

  it("접두를 뺀 이름은 둘이 같다 — 프로토콜이 바뀌어도 같은 쿠키를 가리킨다", () => {
    expect(stateCookieName(true).replace("__Host-", "")).toBe(stateCookieName(false));
  });

  it("이름이 비어 있지 않다", () => {
    expect(stateCookieName(false).length).toBeGreaterThan(0);
  });
});

describe("stateCookieNames — 읽는 쪽은 두 이름을 다 본다", () => {
  /**
   * ⚠️ **쓰는 쪽과 읽는 쪽이 프로토콜을 다른 신호로 판정한다.** Action은 `x-forwarded-proto`를,
   * callback은 요청 URL을 본다 — 갈리면 **쓴 쿠키와 찾는 쿠키의 이름이 달라져** 연결이 100%
   * `state-mismatch`가 되고, 증상이 Safari 접두 함정과 바이트 단위로 같아 서명·nonce를 의심하게
   * 만든다. `lib/auth/cookie.ts`가 `authjs.session-token`과 `__Secure-` 접두 둘을 다 보는 것과 같은
   * 해법이다: **읽는 쪽이 관대하면 판정이 갈려도 동작한다.**
   */
  it("접두 있는 이름과 없는 이름 둘을 준다", () => {
    expect([...stateCookieNames()].sort()).toEqual(
      [stateCookieName(true), stateCookieName(false)].sort(),
    );
  });

  it("접두 붙은 쪽이 먼저다 — https에서 심은 것을 먼저 찾는다", () => {
    expect(stateCookieNames()[0]).toBe(stateCookieName(true));
  });

  it("두 이름이 서로 다르다 — 목록이 사실상 하나가 되지 않는다", () => {
    expect(new Set(stateCookieNames()).size).toBe(2);
  });
});
