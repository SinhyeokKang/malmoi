import { describe, expect, it } from "vitest";

import { routes } from "@/lib/routes";

/**
 * 링크 생성기의 계약. **경로 문자열은 타입이 못 보는 부류라**(2026-09-05 사고) 여기와
 * `entry-points.test.ts`의 "죽은 라우트 링크"가 함께 든다 — 이쪽은 모양을, 그쪽은 실재를 본다.
 */
describe("routes — 정적 경로", () => {
  it("목록과 생성", () => {
    expect(routes.projects()).toBe("/projects");
    expect(routes.newProject()).toBe("/projects/new");
  });

  /**
   * ⚠️ **사용자 축이다** (SAAS §7.7 — 6b-4). slug를 받지 않고, `middleware.ts`의 matcher가
   * `/projects/:path*` 하나였으므로 이 경로는 **1차 차단 밖에서 태어난다** —
   * `entry-points.test.ts`의 "보호 라우트가 미들웨어 matcher에 있다"가 그것을 잡는다.
   */
  it("계정 화면은 프로젝트 축이 아니다 — slug가 없다", () => {
    expect(routes.account()).toBe("/account");
  });

  /**
   * ⚠️ **6b-4가 이것을 미뤘다** — Home 페이지가 없는 채로 등재하면 404를 가리키는 생성기가 되고,
   * 죽은 링크 검사의 접두 규칙(`r.startsWith(path + "/")`)이 `/projects/*`를 통과시켜 못 잡는다.
   * 6b-6이 그 페이지와 **같은 커밋에** 넣는다.
   */
  it("프로젝트 루트가 Home이다 — 진입의 착지점 (6b-6)", () => {
    expect(routes.project("bugshot-2")).toBe("/projects/bugshot-2");
  });

  it("프로젝트 경로는 slug를 그대로 든다", () => {
    expect(routes.locales("bugshot-2")).toBe("/projects/bugshot-2/locales");
    expect(routes.settings("bugshot-2")).toBe("/projects/bugshot-2/settings");
    expect(routes.invite("abc123")).toBe("/invite/abc123");
  });
});

/**
 * **`logs`도 페이지와 같은 커밋에 온다** (7단계 — 6b-4·6b-6과 같은 판정). 페이지 없이 등재하면
 * 404를 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 `/projects/*`를 통과시켜 못 잡는다.
 */
describe("routes.logs — 서버 페이지네이션", () => {
  it("커서가 없으면 쿼리가 붙지 않는다 — 첫 페이지 주소가 깨끗해야 공유된다", () => {
    expect(routes.logs("bugshot-2")).toBe("/projects/bugshot-2/logs");
    expect(routes.logs("bugshot-2", {})).toBe("/projects/bugshot-2/logs");
  });

  it("커서는 `?cursor=`다 — `entry-points.test.ts`가 이 키를 실재 라우트와 대조한다", () => {
    expect(routes.logs("bugshot-2", { cursor: "abc" })).toBe("/projects/bugshot-2/logs?cursor=abc");
  });

  it("빈 커서는 지운다 — `?cursor=`만 실리면 서버가 그것을 값으로 읽는다", () => {
    expect(routes.logs("bugshot-2", { cursor: "" })).toBe("/projects/bugshot-2/logs");
  });
});

describe("routes.translations — 쿼리", () => {
  it("쿼리가 없으면 물음표도 없다", () => {
    expect(routes.translations("p")).toBe("/projects/p/translations");
    expect(routes.translations("p", {})).toBe("/projects/p/translations");
  });

  it("undefined는 지운다 — `?ns=undefined`가 실리면 서버가 그것을 이름으로 읽는다", () => {
    expect(routes.translations("p", { ns: undefined, focus: "ko" })).toBe("/projects/p/translations?focus=ko");
  });

  it("빈 문자열도 지운다 — 필터를 비운 것은 필터가 없는 것이다", () => {
    expect(routes.translations("p", { q: "", focus: "ko" })).toBe("/projects/p/translations?focus=ko");
  });

  it("`*`(전체)가 살아서 나간다 — 인코딩돼 이름이 바뀌면 전체 보기가 죽는다", () => {
    const url = routes.translations("p", { ns: "*" });
    expect(url).toBe("/projects/p/translations?ns=*");
    expect(new URL(url, "https://x").searchParams.get("ns")).toBe("*");
  });

  it("값의 특수문자는 인코딩한다 — 필터 문자열이 쿼리를 깨지 않는다", () => {
    const url = routes.translations("p", { q: "a b&c=d" });
    expect(new URL(url, "https://x").searchParams.get("q")).toBe("a b&c=d");
  });

  it("네 파라미터가 다 실린다", () => {
    const url = new URL(routes.translations("p", { ns: "common", focus: "ko", q: "save", state: "needs-review" }), "https://x");
    expect([...url.searchParams.entries()]).toEqual([
      ["ns", "common"],
      ["focus", "ko"],
      ["q", "save"],
      ["state", "needs-review"],
    ]);
  });
});
