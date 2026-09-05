import { describe, expect, it } from "vitest";

import { publicSession } from "../public-session";

/**
 * DB 세션에서 `session` 콜백이 받는 `session`은 **DB 행**이다(`@auth/core/lib/actions/session.js:98`이
 * `{ ...세션행, user }`를 넘긴다) — `sessionToken`·`userId`가 들어 있다. 그 객체를 그대로 돌려주면
 * `/api/auth/session`이 HttpOnly 쿠키와 같은 토큰을 JSON으로 준다 (Codex 감사 2026-09-06 #1).
 *
 * 기본 콜백(`lib/init.js:20`)은 이름·이메일·이미지·만료만 고르는데 우리 콜백이 그것을 대체하면서
 * 허용 목록을 잃었다. 여기서 **새 객체를 만들어** 돌려준다 — 입력을 넓혀도 새는 키가 없다.
 */

const row = {
  sessionToken: "raw-token-must-not-leak",
  userId: "u1",
  expires: new Date("2026-09-07T00:00:00Z"),
};
const user = { id: "u1", name: "Kim", email: "k@a.com", image: null, emailVerified: null };

describe("publicSession — 허용 목록", () => {
  it("user.id·name·email·image와 expires만 남는다", () => {
    expect(publicSession({ session: row, user })).toEqual({
      user: { id: "u1", name: "Kim", email: "k@a.com", image: null },
      expires: "2026-09-07T00:00:00.000Z",
    });
  });

  it("sessionToken·userId는 어느 깊이에도 없다", () => {
    const json = JSON.stringify(publicSession({ session: row, user }));
    expect(json).not.toContain("raw-token-must-not-leak");
    expect(json).not.toContain("sessionToken");
    expect(json).not.toContain("userId");
  });

  it("입력에 모르는 키가 늘어도 출력은 늘지 않는다", () => {
    const wide = { ...row, extra: "x", nested: { secret: "y" } };
    const wideUser = { ...user, createdAt: new Date(), token: "z" };
    const out = publicSession({ session: wide, user: wideUser });
    expect(Object.keys(out).sort()).toEqual(["expires", "user"]);
    expect(Object.keys(out.user).sort()).toEqual(["email", "id", "image", "name"]);
  });

  it("expires가 이미 문자열이면 그대로 둔다", () => {
    const out = publicSession({ session: { ...row, expires: "2026-09-07T00:00:00.000Z" }, user });
    expect(out.expires).toBe("2026-09-07T00:00:00.000Z");
  });

  it("name·email·image가 없으면 null이다 — undefined는 JSON에서 키가 사라져 모양이 흔들린다", () => {
    const out = publicSession({ session: row, user: { id: "u1" } });
    expect(out.user).toEqual({ id: "u1", name: null, email: null, image: null });
  });
});
