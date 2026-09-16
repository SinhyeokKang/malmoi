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
    for (const error of ["invalid input", "base-branch-missing"] as const) {
      expect(planImportRefusal(error)).toEqual({ tone: "warning", dismissible: false, action: null });
    }
  });

  /**
   * ⚠️ **"요청이 못 갔다"는 생산자가 둘이다** (2026-09-15 라운드 3) — 서버 `catch`가 `ingest-failed`를,
   * 클라이언트 `catch`가 `unavailable`을 낸다. **둘이 같은 계획이어야 한다**: 한쪽만 등재하면 다른 쪽이
   * 폴백으로 떨어져 닫기도 액션도 없는 채 남의 화면 문구를 띄운다(실제로 한 번 그렇게 났다).
   */
  it("요청이 못 간 두 코드가 같은 계획을 받는다", () => {
    const plan = { tone: "danger", dismissible: true, action: null };
    expect(planImportRefusal("ingest-failed")).toEqual(plan);
    expect(planImportRefusal("unavailable")).toEqual(plan);
  });

  /**
   * ⚠️ **기준은 수가 아니라 "닫아도 같은 거부가 반복되나"다.** 반복되는 갈래에 닫기를 주면 사람이
   * "무엇이 막혔는지"를 다시 눌러서 알아내야 한다 — 그래서 상태가 안 바뀌는 거부에는 닫기가 없다.
   * 반대로 **일시적 실패는 반복되지 않으므로** 닫을 수 있어야 한다. 처음에는 이 검사가 "하나뿐이다"로
   * 수를 박아 두었는데, 그 형은 기준이 바뀌었는지와 목록이 늘었는지를 구별하지 못한다.
   */
  it("닫기는 상태가 바뀌어야 풀리는 거부에만 없다", () => {
    /*
      ⚠️ **두 목록의 합집합이 union 전체여야 한다** (라운드 4 ⚪) — 전에는 12개만 적어 두고 "새 코드는
      분류돼야 한다"고 적었는데, 실제로는 **어느 목록에도 없으면 둘 다 green**이었다(`last-owner`·
      `reauthorize`·`resource-limit` …). 아래 타입이 남은 코드를 `never`가 아니게 만들어 **컴파일에서**
      막는다 — 런타임 단언으로는 "빠뜨린 것"과 "없는 것"을 구별할 수 없다.
    */
    /**
     * 다시 눌러도 같은 답이 나온다 — 리포·설정·권한이 바뀌어야 풀린다.
     * ⚠️ **`as const`다** — `RepositoryImportError[]`로 주석을 달면 `(typeof repeats)[number]`가 union
     * 전체로 넓어져 아래 전수 검사가 **언제나 통과하는 공허한 검사**가 된다.
     */
    const repeats = [
      // 이 기능이 직접 내는 것
      "not-ready", "not-connected", "no-surfaces", "repo-replaced", "invalid input",
      // 세션·인가 — 다시 눌러도 같다
      "unauthorized", "forbidden", "not-found", "archived", "last-owner", "not-member",
      // 연결·설치 — 사람이 GitHub에서 손대야 풀린다
      "reauthorize", "repo-not-installed", "installation-forbidden", "repo-forbidden",
      "no-installations", "no-repos", "no-candidates",
      // 온보딩 판정 — 리포나 설정이 바뀌어야 답이 달라진다
      "base-branch-missing", "invalid-branch", "invalid-slug", "slug-taken", "limit-reached",
      "manual-no-match", "not-awaiting", "no-candidates",
      // 규모 — 같은 리포에 같은 상한이라 다시 눌러도 같다
      "tree-truncated", "resource-limit", "key-count-failed",
      // 계정 연결 왕복 — 그 흐름을 처음부터 다시 해야 한다
      "state-mismatch", "state-expired", "wrong-user", "denied", "exchange-failed", "taken-by-other",
    ] as const satisfies readonly RepositoryImportError[];
    /** 기다리거나 다시 누르면 답이 달라진다. */
    const transient = ["already-running", "ingest-failed", "unavailable"] as const satisfies readonly RepositoryImportError[];
    type Classified = (typeof repeats)[number] | (typeof transient)[number];
    type Unclassified = Exclude<RepositoryImportError, Classified>;
    // 남은 코드가 있으면 `never`가 아니게 되어 이 별칭이 컴파일 에러다.
    type _Exhaustive = Unclassified extends never ? true : ["분류되지 않은 거부 코드", Unclassified];
    const exhaustive: _Exhaustive = true;
    expect(exhaustive).toBe(true);
    expect(repeats.filter(error => planImportRefusal(error).dismissible)).toEqual([]);
    expect(transient.filter(error => !planImportRefusal(error).dismissible)).toEqual([]);
  });
});
