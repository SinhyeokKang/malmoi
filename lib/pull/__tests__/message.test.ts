import { describe, expect, it } from "vitest";
import { accessErrorMessage } from "@/lib/auth/message";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import { pullMessage, type PullOutcome } from "../message";

/**
 * pull 결과 → 화면 문구. **순수 함수로 뽑은 이유는 케이스 누락을 컴파일 타임에 막는 것이다** —
 * JSX 안에 삼항으로 흩어지면 `PullResult`에 상태가 늘어도 아무도 알려주지 않는다.
 *
 * 특히 **no-op이 기본 경로다** (MVP §3.3 1.5 "여기서 대부분 끝난다"). 성공 직후 한 번 더 누르면
 * 반드시 이 경로이고, 무반응이면 편집자가 고장으로 읽는다.
 *
 * **문구 다섯 · tone 넷이다** (design §3.4) — success가 둘이라 개수가 다르다.
 */

const committed = (over: Partial<Extract<PullOutcome, { status: "committed" }>> = {}) =>
  ({
    status: "committed",
    pr: "created",
    commitSha: "abc",
    prUrl: "https://github.com/o/r/pull/1",
    changed: ["i18n/ko.json"],
    ...over,
  }) as const satisfies PullOutcome;

describe("pullMessage — 편집자가 읽는 문구다", () => {
  it("새로 보내면 success에 링크가 붙는다", () => {
    const m = pullMessage(committed());
    expect(m.tone).toBe("success");
    expect(m.href).toBe("https://github.com/o/r/pull/1");
  });

  it("먼저 보낸 것을 갱신하면 문구가 다르다 — 편집자에게 다른 사실이다", () => {
    const created = pullMessage(committed({ pr: "created" }));
    const updated = pullMessage(committed({ pr: "updated" }));
    expect(updated.tone).toBe("success");
    expect(updated.text).not.toBe(created.text);
  });

  it("편집이 없으면 최신 상태라고 알린다 — 무반응이면 고장으로 읽힌다", () => {
    const m = pullMessage({ status: "skipped", reason: "no-edits" });
    expect(m.tone).toBe("info");
    expect(m.text).not.toBe("");
    expect(m.href).toBeUndefined();
  });

  it("파일이 안 바뀌어도 최신 상태다 — 두 스킵 이유를 편집자에게 구별해 보이지 않는다", () => {
    const a = pullMessage({ status: "skipped", reason: "no-edits" });
    const b = pullMessage({ status: "skipped", reason: "no-changes" });
    expect(b.tone).toBe(a.tone);
    expect(b.text).toBe(a.text);
  });

  it("실패는 danger 톤이고 원인을 싣는다", () => {
    const m = pullMessage({ status: "failed", error: "cannot read base branch: dev" });
    expect(m.tone).toBe("danger");
    expect(m.text).toContain("dev");
  });

  it("문구 다섯이 서로 다르다 — 같은 말을 두 상태에 쓰지 않는다", () => {
    const texts = [
      pullMessage({ status: "skipped", reason: "no-edits" }).text,
      pullMessage(committed({ pr: "created" })).text,
      pullMessage(committed({ pr: "updated" })).text,
      pullMessage(committed({ warnings: ["x"] })).text,
      pullMessage({ status: "failed", error: "boom" }).text,
    ];
    expect(new Set(texts).size).toBe(5);
  });

  it("tone은 넷이고 Alert variant 이름과 같다 (DESIGN §6.2)", () => {
    expect(pullMessage({ status: "skipped", reason: "no-edits" }).tone).toBe("info");
    expect(pullMessage(committed()).tone).toBe("success");
    expect(pullMessage(committed({ warnings: ["x"] })).tone).toBe("warning");
    expect(pullMessage({ status: "failed", error: "boom" }).tone).toBe("danger");
  });

  it("문구에 PR·머지 같은 git 어휘를 쓰지 않는다 — 편집자는 비개발자다 (spec 사용자 절)", () => {
    const all = [
      pullMessage(committed({ pr: "created" })),
      pullMessage(committed({ pr: "updated" })),
      pullMessage(committed({ warnings: ["x"] })),
      pullMessage({ status: "skipped", reason: "no-edits" }),
    ];
    for (const m of all) {
      expect(m.text).not.toMatch(/PR|pull request|머지|merge|커밋|commit|브랜치|branch/i);
    }
  });

  it("링크 레이블도 편집자 어휘다", () => {
    const m = pullMessage(committed());
    expect(m.linkLabel).toBeDefined();
    expect(m.linkLabel).not.toMatch(/PR|pull request/i);
  });

  it("같은 입력 두 번 → 같은 결과 (결정성 — 타임스탬프를 넣지 않는다)", () => {
    const r = { status: "skipped", reason: "no-edits" } as const;
    expect(pullMessage(r)).toEqual(pullMessage(r));
  });
});

/**
 * **버린 값을 성공으로 접지 않는다** (SAAS 불변식 9). warnings가 있으면 tone이 `warning`이고,
 * **스킵에도 그것이 붙는다** — 2층 스킵 + writer 경고가 같이 나올 수 있다.
 */
describe("pullMessage — writer가 버린 항목", () => {
  it("warnings가 있으면 건수와 '개발자에게 알리라'를 덧붙인다 — 값이 사라진 것을 편집자가 알아야 한다", () => {
    const m = pullMessage(committed({ warnings: ["i18n/en.json: 'a.b' dropped"] }));
    expect(m.tone).toBe("warning");
    expect(m.text).toMatch(/1 value couldn.t be written.*developers/);
  });

  it("warnings가 없으면 성공 문구가 그대로다", () => {
    expect(pullMessage(committed()).tone).toBe("success");
    expect(pullMessage(committed()).text).not.toMatch(/couldn't be written/);
  });

  it("스킵 + warnings도 warning이다 — info로 접으면 버린 값을 숨기는 것이다", () => {
    const m = pullMessage({ status: "skipped", reason: "no-changes", warnings: ["a", "b"] });
    expect(m.tone).toBe("warning");
    expect(m.text).toMatch(/2 values/);
  });

  it("스킵에는 'Sent'라고 쓰지 않는다 — 아무것도 안 갔다", () => {
    const skipped = pullMessage({ status: "skipped", reason: "no-changes", warnings: ["a"] });
    const sent = pullMessage(committed({ warnings: ["a"] }));
    expect(skipped.text).not.toMatch(/^Sent/);
    expect(sent.text).toMatch(/^Sent/);
  });
});

/**
 * **인가 거부가 내부 토큰으로 뜨지 않는다.** `triggerPullAction`은 `error: access.status`를 내는데 이 함수가
 * `내보내기에 실패했어요: not-found`로 그렸다 — `accessErrorMessage`가 정확히 그 토큰들을 위해 만들어졌는데
 * Publish 버튼만 안 지났다 (code-review 2026-09-06 🟡9). 멤버 제거된 편집자가 열어 둔 화면에서 누르면 그 줄이 뜬다.
 */
describe("pullMessage — failed의 인가 사유는 accessErrorMessage를 지난다", () => {
  it("not-found·unauthorized·forbidden·unavailable이 사람 말이다", () => {
    for (const error of ["not-found", "unauthorized", "forbidden", "unavailable"] as const) {
      const m = pullMessage({ status: "failed", error });
      expect(m.tone).toBe("danger");
      expect(m.text).toBe(accessErrorMessage(error));
      expect(m.text).not.toContain(error);
    }
  });

  it("장애를 거부처럼 말하지 않는다 — unavailable은 다른 문구다", () => {
    const unavailable = pullMessage({ status: "failed", error: "unavailable" }).text;
    expect(unavailable).toBe(accessErrorMessage("unavailable"));
    expect(unavailable).not.toBe(accessErrorMessage("forbidden"));
  });

  it("인가 밖의 사유는 원문을 남긴다 — 개발자가 보는 신호다", () => {
    expect(pullMessage({ status: "failed", error: "internal (ref abc)" }).text).toContain("internal (ref abc)");
  });

  /**
   * ⚠️ **온보딩 갈래도 읽는다** (2026-09-07, T6). `triggerPullAction`이 첫 적재 전 프로젝트를
   * `not-ready`로 거부하는데, 이 함수가 `isAccessError`만 보면 그 사유가 `내보내기에 실패했어요:
   * not-ready`로 나간다 — 정확히 🟡9와 같은 형태다.
   */
  it("not-ready는 onboardErrorMessage를 지난다 — 내부 토큰이 아니다", () => {
    const m = pullMessage({ status: "failed", error: "not-ready" });
    expect(m.text).toBe(onboardErrorMessage("not-ready"));
    expect(m.text).not.toContain("not-ready");
  });
});
