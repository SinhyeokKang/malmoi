import { describe, expect, it } from "vitest";
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
