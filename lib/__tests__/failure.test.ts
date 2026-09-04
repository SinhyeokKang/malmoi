import { describe, expect, it } from "vitest";
import { requireEnv } from "../env";
import { MissingEnvError, classifyFailure } from "../failure";

/**
 * **500 본문에 무엇을 실을지의 판정** (2026-09-04 audit #15).
 *
 * POSTMORTEM 2026-09-03이 "본문 없는 500"을 결함으로 박았고, 그래서 두 라우트는 던진 메시지를
 * 그대로 실었다. 그 결정의 전제는 "로그를 읽는 사람이 우리뿐"이었는데 `.github/actions/l10n-push`는
 * **임의의 대상 리포**에서 돌고 그중 하나(`bugshot-2`)가 public이다 — public 리포의 Actions 로그는
 * 누구나 읽는다. Prisma 접속 오류 한 번이 pooler 호스트와 DB 유저를 거기 박는다.
 *
 * 그래서 뒤집는 게 아니라 **가른다**: 우리가 만든 메시지(변수 이름만 담는다)는 그대로, 남의
 * 라이브러리가 만든 메시지는 `ref`만 내보내고 전문은 서버 로그로 보낸다.
 */

describe("classifyFailure — 우리 메시지와 남의 메시지를 가른다", () => {
  it("requireEnv가 던진 것은 안전하다 — 변수 이름뿐이고 그게 회고가 요구한 것이다", () => {
    let thrown: unknown;
    try {
      requireEnv("ACTIVE_PROJECT_SLUG", {});
    } catch (e) {
      thrown = e;
    }
    const c = classifyFailure(thrown);
    expect(c.safe).toBe(true);
    expect(c.safe && c.message).toContain("ACTIVE_PROJECT_SLUG");
  });

  it("Prisma 접속 오류는 안전하지 않다 — 호스트·유저가 본문으로 나가면 안 된다", () => {
    const c = classifyFailure(
      new Error(`Can't reach database server at \`aws-0-ap-northeast-1.pooler.supabase.com:5432\``),
    );
    expect(c.safe).toBe(false);
    // 전문은 버리지 않는다 — 서버 로그로 보낼 값이다.
    expect(c.safe === false && c.detail).toContain("pooler.supabase.com");
  });

  it("Error가 아닌 것을 던져도 문자열로 잡는다", () => {
    const c = classifyFailure("문자열을 던졌다");
    expect(c.safe).toBe(false);
    expect(c.safe === false && c.detail).toContain("문자열을 던졌다");
  });

  it("MissingEnvError는 이름으로 판정한다 — instanceof는 번들 경계를 넘으면 깨진다", () => {
    const impostor = new Error("환경변수 X이(가) 없다");
    impostor.name = MissingEnvError.name;
    expect(classifyFailure(impostor).safe).toBe(true);
  });

  it("메시지 문자열이 아니라 **타입**으로 가른다 — 남의 오류가 우리 문구를 담아도 안전이 아니다", () => {
    // 문구로 갈랐다면 여기서 통과했을 것이다. 그게 이 함수가 클래스를 쓰는 이유다.
    expect(classifyFailure(new Error("환경변수 ACTIVE_PROJECT_SLUG이(가) 없다")).safe).toBe(false);
  });
});
