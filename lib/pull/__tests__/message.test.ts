import { describe, expect, it } from "vitest";
import { accessErrorMessage } from "@/lib/auth/message";
import { pullMessage } from "../message";

/**
 * pull 결과 → 화면 문구. **순수 함수로 뽑은 이유는 케이스 누락을 컴파일 타임에 막는 것이다** —
 * JSX 안에 삼항으로 흩어지면 `PullResult`에 상태가 늘어도 아무도 알려주지 않는다.
 *
 * 특히 **no-op이 기본 경로다** (MVP §3.3 1.5 "여기서 대부분 끝난다"). 성공 직후 한 번 더 누르면
 * 반드시 이 경로이고, 무반응이면 편집자가 고장으로 읽는다.
 */

describe("pullMessage — 편집자가 읽는 문구다", () => {
  it("커밋되면 PR 링크를 준다", () => {
    const m = pullMessage({
      status: "committed",
      commitSha: "abc",
      prUrl: "https://github.com/o/r/pull/1",
      changed: ["i18n/ko.json"],
    });
    expect(m.tone).toBe("success");
    expect(m.href).toBe("https://github.com/o/r/pull/1");
  });

  it("편집이 없으면 최신 상태라고 알린다 — 무반응이면 고장으로 읽힌다", () => {
    const m = pullMessage({ status: "skipped", reason: "no-edits" });
    expect(m.tone).toBe("muted");
    expect(m.text).not.toBe("");
    expect(m.href).toBeUndefined();
  });

  it("파일이 안 바뀌어도 최신 상태다 — 두 스킵 이유를 편집자에게 구별해 보이지 않는다", () => {
    const a = pullMessage({ status: "skipped", reason: "no-edits" });
    const b = pullMessage({ status: "skipped", reason: "no-changes" });
    expect(b.tone).toBe(a.tone);
    expect(b.text).toBe(a.text);
  });

  it("실패는 destructive 톤이고 원인을 싣는다", () => {
    const m = pullMessage({ status: "failed", error: "base 브랜치를 읽을 수 없다: dev" });
    expect(m.tone).toBe("destructive");
    expect(m.text).toContain("dev");
  });

  it("문구에 PR·머지 같은 git 어휘를 쓰지 않는다 — 편집자는 비개발자다 (spec 사용자 절)", () => {
    const all = [
      pullMessage({ status: "committed", commitSha: "a", prUrl: "u", changed: [] }),
      pullMessage({ status: "skipped", reason: "no-edits" }),
    ];
    for (const m of all) {
      expect(m.text).not.toMatch(/PR|pull request|머지|merge|커밋|commit|브랜치|branch/i);
    }
  });

  it("링크 레이블도 편집자 어휘다", () => {
    const m = pullMessage({ status: "committed", commitSha: "a", prUrl: "u", changed: [] });
    expect(m.linkLabel).toBeDefined();
    expect(m.linkLabel).not.toMatch(/PR|pull request/i);
  });

  it("같은 입력 두 번 → 같은 결과 (결정성 — 타임스탬프를 넣지 않는다)", () => {
    const r = { status: "skipped", reason: "no-edits" } as const;
    expect(pullMessage(r)).toEqual(pullMessage(r));
  });
});

describe("pullMessage — writer가 버린 항목", () => {
  it("warnings가 있으면 건수와 '개발자에게 알려 주세요'를 덧붙인다 — 값이 사라진 것을 편집자가 알아야 한다", () => {
    const m = pullMessage({
      status: "committed",
      commitSha: "abc",
      prUrl: "https://x/pr/1",
      changed: ["i18n/en.json"],
      warnings: ["i18n/en.json: 'a.b'가 접두 충돌로 빠졌다"],
    });
    expect(m.text).toMatch(/1건.*개발자/);
  });

  it("warnings가 없으면 문구가 그대로다", () => {
    const m = pullMessage({ status: "committed", commitSha: "abc", prUrl: "https://x/pr/1", changed: [] });
    expect(m.text).not.toMatch(/반영되지 못했/);
  });
});

/**
 * **인가 거부가 영어 토큰으로 뜨지 않는다.** `triggerPullAction`은 `error: access.status`를 내는데 이 함수가
 * `내보내기에 실패했어요: not-found`로 그렸다 — `accessErrorMessage`가 정확히 그 토큰들을 위해 만들어졌는데
 * Publish 버튼만 안 지났다 (code-review 2026-09-06 🟡9). 멤버 제거된 편집자가 열어 둔 화면에서 누르면 그 줄이 뜬다.
 */
describe("pullMessage — failed의 인가 사유는 accessErrorMessage를 지난다", () => {
  it("not-found·unauthorized·forbidden·unavailable이 한국어 문구다", () => {
    for (const error of ["not-found", "unauthorized", "forbidden", "unavailable"] as const) {
      const m = pullMessage({ status: "failed", error });
      expect(m.tone).toBe("destructive");
      expect(m.text).toBe(accessErrorMessage(error));
      expect(m.text).not.toContain(error);
    }
  });

  it("unavailable은 재시도를 권한다 — 장애를 거부처럼 말하지 않는다", () => {
    expect(pullMessage({ status: "failed", error: "unavailable" }).text).toContain("잠시");
  });

  it("인가 밖의 사유는 원문을 남긴다 — 개발자가 보는 신호다", () => {
    expect(pullMessage({ status: "failed", error: "internal (ref abc)" }).text).toContain("internal (ref abc)");
  });
});
