import { describe, expect, it, vi } from "vitest";
import { requireEnv } from "../env";
import { AppError, MissingEnvError, classifyFailure, fail, logCaught } from "../failure";

/**
 * **500 본문에 무엇을 실을지의 판정** (2026-09-04 audit #15).
 *
 * POSTMORTEM 2026-09-03이 "본문 없는 500"을 결함으로 박았고, 그래서 두 라우트는 던진 메시지를
 * 그대로 실었다. 그 결정의 전제는 "로그를 읽는 사람이 우리뿐"이었는데 `.github/actions/malmoi-i18n-push`는
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
      requireEnv("EXAMPLE_MISSING_VAR", {});
    } catch (e) {
      thrown = e;
    }
    const c = classifyFailure(thrown);
    expect(c.safe).toBe(true);
    expect(c.safe && c.message).toContain("EXAMPLE_MISSING_VAR");
  });

  /**
   * ⚠️ **2026-09-18에 뒤집혔다.** 전에는 이 자리가 `detail`이 전문을 담는 것을 고정했고 근거는
   * "본문엔 `ref`만, 전문은 서버 로그로"였다(2026-09-04). 그 판단은 **서버 로그를 안전한 곳으로**
   * 봤는데, `lib/github-connect/log.ts`가 2026-09-10 credential 리뷰에서 같은 위험을 **로그에도**
   * 걸었다: 남의 라이브러리 메시지에는 Prisma 인자·암호문이 실릴 수 있다. 두 규칙이 서로 반대인
   * 채로 넉 달을 굴렀고, 더 보수적인 쪽으로 합쳤다.
   *
   * ⚠️ **대가를 적어 둔다** — 이제 Prisma 접속 실패의 호스트·유저는 **어디에도 안 남는다.** 남는
   * 것은 갈래 이름뿐이고, 그것으로 부족하면 재현이 유일한 길이다.
   */
  it("Prisma 접속 오류는 안전하지 않고, 호스트·유저가 로그에도 안 남는다", () => {
    const c = classifyFailure(
      new Error(`Can't reach database server at \`aws-0-ap-northeast-1.pooler.supabase.com:5432\``),
    );
    expect(c.safe).toBe(false);
    expect(c.safe === false && c.detail).not.toContain("pooler.supabase.com");
    // 분류는 남는다 — 전부 한 단어로 접으면 로그를 남기는 의미가 사라진다 (`log.ts`와 같은 판단).
    expect(c.safe === false && c.detail).toBe("Error");
  });

  /** ⚠️ HTTP 오류는 상태 코드가 갈래다 — `log.ts`가 `http-<status>`를 쓰는 것과 같은 형이다. */
  it("status를 든 오류는 `http-<status>`로 접힌다", () => {
    const c = classifyFailure(Object.assign(new Error("secret in body"), { status: 503 }));
    expect(c.safe === false && c.detail).toBe("http-503");
  });

  it("Error가 아닌 것을 던져도 타입으로 잡는다 — 값 자체는 안 남는다", () => {
    const c = classifyFailure("문자열을 던졌다");
    expect(c.safe).toBe(false);
    expect(c.safe === false && c.detail).not.toContain("문자열을 던졌다");
    expect(c.safe === false && c.detail).toBe("string");
  });

  it("MissingEnvError는 이름으로 판정한다 — instanceof는 번들 경계를 넘으면 깨진다", () => {
    const impostor = new Error("환경변수 X이(가) 없다");
    impostor.name = MissingEnvError.name;
    expect(classifyFailure(impostor).safe).toBe(true);
  });

  it("메시지 문자열이 아니라 **타입**으로 가른다 — 남의 오류가 우리 문구를 담아도 안전이 아니다", () => {
    // 문구로 갈랐다면 여기서 통과했을 것이다. 그게 이 함수가 클래스를 쓰는 이유다.
    expect(classifyFailure(new Error("환경변수 EXAMPLE_MISSING_VAR이(가) 없다")).safe).toBe(false);
  });
});

/**
 * **우리 도메인 오류도 안전하다** (2026-09-04, #15 후속). 첫 구현은 `MissingEnvError`만 안전으로
 * 봤고, 그래서 `프로젝트를 찾을 수 없다: order-check`가 `internal`로 접혔다 — 프로덕션 500의
 * 원인을 Vercel 로그에서 찾아야 했다. slug·경로 템플릿·어댑터 이름은 시크릿이 아니고 CI가 이미
 * 입력으로 아는 값이다. 회고가 요구한 "원인이 남는 500"이 여기서 회수된다.
 */
describe("AppError — 우리 도메인 오류는 본문에 실린다", () => {
  it("fail()이 던진 것은 안전하다", () => {
    let thrown: unknown;
    try {
      fail("프로젝트를 찾을 수 없다: order-check");
    } catch (e) {
      thrown = e;
    }
    const c = classifyFailure(thrown);
    expect(c.safe).toBe(true);
    expect(c.safe && c.message).toContain("order-check");
  });

  it("fail()의 반환형이 never다 — throw와 같게 좁혀진다", () => {
    const narrow = (v: string | null): string => {
      if (v === null) fail("null이다");
      return v;
    };
    expect(narrow("x")).toBe("x");
  });

  it("AppError·MissingEnvError 둘 다 안전이고, 남의 Error는 아니다", () => {
    expect(classifyFailure(new AppError("우리 것")).safe).toBe(true);
    expect(classifyFailure(new MissingEnvError("환경변수 X이(가) 없다")).safe).toBe(true);
    expect(classifyFailure(new Error("우리 것")).safe).toBe(false);
    expect(classifyFailure(new TypeError("남의 것")).safe).toBe(false);
  });

  it("⚠️ 시크릿을 담은 메시지는 `fail`로 던지지 않는다 — 판정이 아니라 규율이다", () => {
    // 이 테스트는 코드가 아니라 규칙을 고정한다: `fail`은 **우리가 문구를 정한** 오류에만 쓴다.
    // 라이브러리 메시지를 감싸 `fail(String(e))`로 넘기면 그 순간 이 방어가 무의미해진다.
    expect(classifyFailure(fail_wrapped()).safe).toBe(false);
  });
});

/** 남의 오류를 그대로 다시 던지면 안전이 아니다 — 감싸지 않는 것이 규칙이다. */
function fail_wrapped(): unknown {
  try {
    throw new Error("Can't reach database server at `pooler.supabase.com`");
  } catch (e) {
    return e;
  }
}

/**
 * **`AppError`가 선택 `code`를 든다** (ARCHITECTURE §5.6).
 *
 * 던지는 자리가 코드를 들어야 `SyncRun.errorCode`가 안정적이다 — 잡는 쪽에서 메시지를 매칭하면
 * 문장 하나가 바뀔 때 분류가 조용히 무너진다. ⚠️ **`classifyFailure`는 이 필드를 안 본다** —
 * 그 함수는 "본문에 실어도 되는가"를 답하고 코드는 "무엇이 실패했나"를 답한다. 축이 다르다.
 */
describe("AppError.code — 던지는 자리가 코드를 든다", () => {
  it("fail의 둘째 인자가 code로 남는다", () => {
    try {
      fail("cannot read the base branch: main", "base-unreadable");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("base-unreadable");
      expect((e as AppError).message).toBe("cannot read the base branch: main");
    }
  });

  it("안 주면 undefined다 — 기존 자리 전부가 그대로 동작한다", () => {
    expect(new AppError("x").code).toBeUndefined();
  });

  it("코드가 있어도 안전 판정은 안 바뀐다 — classifyFailure는 name만 본다", () => {
    expect(classifyFailure(new AppError("x", "not-installed"))).toEqual({ safe: true, message: "x" });
  });
});

/**
 * **삼킨 실패의 한 줄** (launch-readiness L5.2). 사용자에게 갈래 하나로 접혀 나가는 자리에서 원인을 볼 곳이 서버 로그뿐이다 —
 * `classifyFailure`와 같은 규칙(우리 메시지는 그대로, 남의 메시지는 분류 한 낱말)이고 화면의 `ref`와 짝지을 8자를 앞에 둔다.
 */
describe("logCaught", () => {
  it("남의 오류는 분류만, 우리 오류는 메시지를 남긴다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logCaught("login-link", "callback", new TypeError("secret row"));
      logCaught("invite", "accept", new MissingEnvError("missing environment variable PII_ACTIVE_KEY_ID"));
      logCaught("open-pr", "probe", Object.assign(new Error("secret"), { status: 502 }));
      expect(spy.mock.calls.map((c) => c[0])).toEqual([
        expect.stringMatching(/^\[login-link\] \w{8} callback: TypeError$/),
        expect.stringMatching(/^\[invite\] \w{8} accept: missing environment variable PII_ACTIVE_KEY_ID$/),
        expect.stringMatching(/^\[open-pr\] \w{8} probe: http-502$/),
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
