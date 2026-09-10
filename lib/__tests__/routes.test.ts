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
/**
 * **`signIn`이 쿼리 생성기를 지나는 것이 8-1a에서 가장 중요한 한 줄이다**
 * (`features/ui-rework/signin-auth/design.md` §2.1).
 *
 * ⚠️ `entry-points.test.ts`의 "쿼리 파라미터 수신자" 검사는 생성기 호출을
 * **`routes.foo(...)}?key=`** 모양(템플릿 리터럴의 `}`)으로 찾는다. 그래서 문자열 연결
 * (`routes.signIn() + "?error=..."`)로 만들면 **그 검사를 통째로 회피한다** — 보내는 쪽과 받는 쪽이
 * 갈라진 채 통과하는 부류이고 POSTMORTEM 2026-09-06이 그 사고다. `withQuery`가 그 회피를 막는다.
 */
describe("routes.signIn — 쿼리 생성기", () => {
  it("사유가 없으면 물음표도 없다 — 로그인 주소가 깨끗해야 한다", () => {
    expect(routes.signIn()).toBe("/signin");
    expect(routes.signIn({})).toBe("/signin");
  });

  /** `readSession`이 장애를 가르는 것이 URL까지 살아 있어야 사용자에게 닿는다 (POSTMORTEM 2026-09-06). */
  it("세션 장애 사유를 싣는다", () => {
    expect(routes.signIn({ error: "Unavailable" })).toBe("/signin?error=Unavailable");
  });

  /**
   * ⚠️ **`lib/session-revocation/policy.ts`가 이 값의 유일한 생산자다.** 그 자리가 `"/"`로 남아
   * 있으면 루트 껍데기가 쿼리를 버려 **회수 완료 피드백이 원리적으로 안 뜬다** (8-1a T3).
   */
  it("전체 세션 회수 완료를 싣는다", () => {
    expect(routes.signIn({ sessions: "revoked" })).toBe("/signin?sessions=revoked");
  });

  it("undefined·빈 문자열은 지운다 — `?error=`만 실리면 서버가 그것을 값으로 읽는다", () => {
    expect(routes.signIn({ error: undefined })).toBe("/signin");
    expect(routes.signIn({ error: "", sessions: "" })).toBe("/signin");
  });

  it("값의 특수문자는 인코딩한다 — 주소창에서 온 사유가 쿼리를 깨지 않는다", () => {
    const url = new URL(routes.signIn({ error: "a b&c=d" }), "https://x");
    expect(url.searchParams.get("error")).toBe("a b&c=d");
  });
});

/**
 * **페이지와 같은 커밋에 등재한다** (6b-4·6b-6·7단계와 같은 판정). 페이지 없이 넣으면 404를
 * 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 그것을 통과시켜 못 잡는다.
 *
 * ⚠️ 둘 다 **출시 전에 채울 placeholder**다 — 라우트를 지금 따는 이유는 로그인 화면 푸터가
 * 그것을 가리키기 때문이다.
 */
describe("routes.privacy · routes.docs — 공개 문서", () => {
  it("정적 경로다", () => {
    expect(routes.privacy()).toBe("/privacy");
    expect(routes.docs()).toBe("/docs");
  });

  /**
   * ⚠️ **외부 URL은 이 파일에 넣지 않는다** (8-1b). 로그인 푸터의 GitHub 링크가 그것인데,
   * 이 모듈은 **앱 내부 링크**의 단일 출처이고 `entry-points.test.ts`의 "죽은 라우트 링크"가
   * 여기 값들을 **실재하는 `page.tsx`와 대조**한다 — 외부 URL을 섞으면 그 검사가 그것을 앱
   * 경로로 읽고 "없는 라우트"로 잡는다.
   */
  it("외부 URL이 섞여 있지 않다 — 죽은 라우트 검사가 그것을 앱 경로로 읽는다", () => {
    const values = Object.values(routes).map((make) => (make as (...args: never[]) => string)("x" as never));
    expect(values.filter((url) => url.startsWith("http"))).toEqual([]);
  });
});

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
