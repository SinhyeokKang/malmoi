import { describe, expect, it } from "vitest";

import { planImportRefusal } from "@/lib/import/refusal";
import type { RepositoryImportError } from "@/lib/import/result";

/**
 * 거부 Alert의 tone·닫기·액션 (시안 `4f`). **tone은 "다시 누르면 되나"로 갈린다** — 기다리면 풀리는
 * 것만 info이고, 사람이 다른 화면에서 손대야 풀리는 것은 amber이며 닫기를 주지 않는다(닫아도 같은
 * 버튼이 같은 거부를 반복한다).
 */
describe("planImportRefusal", () => {
  it("기다리면 풀리는 거부만 info이고 닫힌다", () => {
    expect(planImportRefusal("already-running")).toEqual({ tone: "info", dismissible: true, action: null });
  });

  it("다른 화면에서 고쳐야 풀리는 둘은 amber이고 닫기 대신 고칠 자리로 보낸다", () => {
    expect(planImportRefusal("not-ready")).toEqual({ tone: "warning", dismissible: false, action: "settings" });
    expect(planImportRefusal("not-connected")).toEqual({ tone: "warning", dismissible: false, action: "reconnect" });
  });

  it("표면 추가는 이 Alert가 보낼 곳이 아니다 — no-surfaces에 액션이 없다", () => {
    expect(planImportRefusal("no-surfaces")).toEqual({ tone: "warning", dismissible: false, action: null });
  });

  /**
   * ⚠️ 리포는 **생성 시점 고정**이라 `connectRepository`가 재고정을 거부한다 — [Reconnect]는 눌러도
   * 실패할 버튼이므로 붙이지 않고, 이 화면에서 풀리지 않으므로 warning이 아니라 danger다
   * (DESIGN §6.2 · 2026-09-10 sec-audit-2 발견 34).
   */
  it("repo-replaced는 danger이고 재연결을 권하지 않는다", () => {
    expect(planImportRefusal("repo-replaced")).toEqual({ tone: "danger", dismissible: false, action: null });
  });

  it("세션·인가 갈래는 danger다", () => {
    for (const error of ["unauthorized", "unavailable", "forbidden", "not-found", "archived"] as const) {
      expect(planImportRefusal(error).tone).toBe("danger");
      expect(planImportRefusal(error).action).toBeNull();
    }
  });

  /**
   * ⚠️ 이 문구들은 **설정 화면의 컨트롤을 이름으로 가리킨다** — Home에는 그 버튼이 없으므로 갈 자리를
   * 함께 준다. 반대로 다음 행동이 사람인 둘은 보낼 곳이 없어 액션을 주지 않는다.
   */
  it("설정 화면의 컨트롤을 가리키는 연결 오류는 그 화면으로 보낸다", () => {
    expect(planImportRefusal("reauthorize")).toEqual({ tone: "warning", dismissible: false, action: "settings" });
    expect(planImportRefusal("repo-not-installed")).toEqual({ tone: "warning", dismissible: false, action: "settings" });
    expect(planImportRefusal("installation-forbidden").action).toBeNull();
    expect(planImportRefusal("repo-forbidden").action).toBeNull();
  });

  it("남은 갈래는 warning으로 떨어지고 닫기를 주지 않는다 — 모르는 값을 성공처럼 보이게 하지 않는다", () => {
    for (const error of ["ingest-failed", "invalid input", "base-branch-missing"] as const) {
      expect(planImportRefusal(error)).toEqual({ tone: "warning", dismissible: false, action: null });
    }
  });

  /**
   * ⚠️ **닫기는 `already-running` 하나뿐이다** — 나머지는 닫아도 같은 버튼이 같은 거부를 반복하고,
   * 그러면 사람이 "무엇이 막혔는지"를 다시 눌러서 알아내야 한다.
   */
  it("닫히는 거부는 하나뿐이다", () => {
    const errors: RepositoryImportError[] = [
      "already-running", "not-ready", "not-connected", "no-surfaces", "repo-replaced",
      "unauthorized", "unavailable", "forbidden", "not-found", "archived", "ingest-failed", "invalid input",
    ];
    expect(errors.filter(error => planImportRefusal(error).dismissible)).toEqual(["already-running"]);
  });
});
