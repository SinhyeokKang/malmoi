import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";
import type { SurfaceImportResult } from "@/lib/import/result";

import { EVENT_RESULTS } from "../payload";
import {
  coverageBoundaryIndex,
  eventView,
  groupByDay,
  planArchivedReason,
  summarizeImportEvent,
  valueState,
  type EventViewRow,
} from "../view";

/**
 * Logs 행의 순수 판정 (logs-rework design §6). `syncRunView`와 같은 형이다 —
 * 화면이 `kind`로 삼항을 엮으면 갈래가 JSX 안에 흩어지고 그 자리에는 누락을 잡는 장치가 없다.
 */

function row(over: Partial<EventViewRow> = {}): EventViewRow {
  return { kind: "PUBLISH", result: "sent", warnings: 0, errorCode: null, ...over };
}

describe("eventView — 결과 어휘 전부", () => {
  it("전부 라벨을 갖고, 서로 다르다", () => {
    const labels = EVENT_RESULTS.map((result) => eventView(row({ result })).label);
    expect(labels.filter((label) => label !== null)).toHaveLength(EVENT_RESULTS.length);
    expect(new Set(labels).size).toBe(EVENT_RESULTS.length);
  });

  it("실패만 danger다", () => {
    expect(eventView(row({ result: "failed", errorCode: "github-error" })).tone).toBe("danger");
  });

  it("사람이 고쳐야 풀리는 셋은 warning이다", () => {
    for (const result of ["deferred", "partial", "notStarted", "notSent"] as const) {
      expect(eventView(row({ result })).tone, result).toBe("warning");
    }
  });

  it("나머지 다섯은 muted다 — 가장 흔한 상태가 가장 조용하다 (DESIGN §6.1)", () => {
    for (const result of ["running", "sent", "nothingToSend", "imported", "superseded"] as const) {
      expect(eventView(row({ result })).tone, result).toBe("muted");
    }
  });

  it("진행 중만 줄임표를 든다 (DESIGN §10)", () => {
    expect(eventView(row({ result: "running" })).label).toContain("…");
    for (const result of EVENT_RESULTS.filter((r) => r !== "running")) {
      expect(eventView(row({ result })).label, result).not.toContain("…");
    }
  });

  /**
   * ⚠️ **비실행 사건의 결과 열은 빈 채 폭을 유지한다** (spec 완료조건 10). 빈 문자열이 아니라
   * `null`이어야 화면이 "값이 없다"와 "이 종류엔 해당 없다"를 가를 수 있다 (POSTMORTEM 2026-09-03).
   */
  it("결과가 없는 사건은 라벨이 null이고 톤은 muted다", () => {
    const view = eventView(row({ kind: "MEMBER", result: null }));
    expect(view.label).toBe(null);
    expect(view.tone).toBe("muted");
  });
});

describe("eventView — warnings는 결과와 독립이다", () => {
  /** ⚠️ 불변식 9 — 버린 값을 숨기지 않는다. 성공한 행에도 붙는다. */
  it("성공 행에도 붙는다", () => {
    const view = eventView(row({ result: "sent", warnings: 3 }));
    expect(view.label).toBe(m.logs.status.succeeded);
    expect(view.tone).toBe("muted");
    expect(view.warningsLabel).toBe(m.logs.warnings(3));
  });

  it("스킵 + warnings도 성립한다 — 하나로 접지 않는다", () => {
    const view = eventView(row({ result: "nothingToSend", warnings: 1 }));
    expect(view.label).toBe(m.logs.status.skipped);
    expect(view.warningsLabel).toBe(m.logs.warnings(1));
  });

  it("0이면 없다", () => {
    expect(eventView(row({ warnings: 0 })).warningsLabel).toBe(null);
  });

  it("음수도 없는 것으로 읽는다 — 화면에 '-1 dropped'를 내지 않는다", () => {
    expect(eventView(row({ warnings: -1 })).warningsLabel).toBe(null);
  });
});

describe("eventView — 실패 사유", () => {
  it("실패만 사유 키를 낸다", () => {
    expect(eventView(row({ result: "failed", errorCode: "github-error" })).reasonKey).toBe("github-error");
    expect(eventView(row({ result: "sent", errorCode: "github-error" })).reasonKey).toBe(null);
  });

  it("모르는 코드는 던지지 않고 fallback이다", () => {
    expect(eventView(row({ result: "failed", errorCode: "nope" })).reasonKey).toBe("fallback");
    expect(eventView(row({ result: "failed", errorCode: null })).reasonKey).toBe("fallback");
    expect(eventView(row({ result: "failed", errorCode: "__proto__" })).reasonKey).toBe("fallback");
  });
});

describe("planArchivedReason — 보관 시 야간 문구를 뺀다", () => {
  const KEYS = Object.keys(m.logs.reasons) as (keyof typeof m.logs.reasons)[];

  it("보관이 아니면 사전 문장 그대로다", () => {
    for (const key of KEYS) expect(planArchivedReason(key, false), key).toBe(m.logs.reasons[key]);
  });

  /**
   * ⚠️ **야간 발송이 보관 프로젝트를 건너뛴다** (`lib/pull/targets.ts`의 `archivedAt === null`) —
   * 그 문장이 거짓이 된다. 사전 문구를 고쳐도 이 검사가 남는 것이 요지다.
   */
  it("보관이면 어느 사유에도 'nightly'가 남지 않는다", () => {
    for (const key of KEYS) {
      expect(planArchivedReason(key, true).toLowerCase(), key).not.toContain("nightly");
    }
  });

  it("실제로 바뀌는 사유가 있다 — 공허한 통과가 아니다", () => {
    const changed = KEYS.filter((key) => planArchivedReason(key, true) !== m.logs.reasons[key]);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("문장을 통째로 비우지 않는다 — 남는 절이 있다", () => {
    for (const key of KEYS) {
      expect(planArchivedReason(key, true).trim(), key).not.toBe("");
      expect(planArchivedReason(key, true), key).not.toMatch(/\s{2,}/);
    }
  });

  it("모르는 키는 던지지 않고 fallback 문장이다", () => {
    for (const bad of ["nope", "__proto__", "constructor"]) {
      expect(planArchivedReason(bad, false), bad).toBe(m.logs.reasons.fallback);
    }
  });
});

describe("valueState — 빈 칸을 만들지 않는다", () => {
  it("값이 있으면 그대로 낸다", () => {
    expect(valueState("hello")).toEqual({ kind: "text", text: "hello" });
  });

  it("전문을 자르지 않는다 — 상한은 이미 저장 층이 든다 (결정 5)", () => {
    const long = "x".repeat(10_000);
    expect(valueState(long)).toEqual({ kind: "text", text: long });
  });

  it("사람이 비운 값은 Empty다", () => {
    expect(valueState("")).toEqual({ kind: "state", label: m.logs.value.empty });
  });

  it("공백만 있는 값은 글자 수를 말한다 — 보이지 않는 차이를 보이게 한다", () => {
    expect(valueState("  ")).toEqual({ kind: "state", label: m.logs.value.spacesOnly(2) });
    expect(valueState(" ")).toEqual({ kind: "state", label: m.logs.value.spacesOnly(1) });
    expect(valueState("\t\n")).toEqual({ kind: "state", label: m.logs.value.spacesOnly(2) });
  });

  it("수집하지 않은 값은 Not recorded다", () => {
    expect(valueState(null)).toEqual({ kind: "state", label: m.logs.value.notRecorded });
  });

  it("복호 실패는 Unavailable이고, 기존 낱말과 같다", () => {
    expect(valueState({ unavailable: true })).toEqual({ kind: "state", label: m.logs.value.unavailable });
    expect(m.logs.value.unavailable).toBe(m.common.unreadable);
  });

  /** ⚠️ **'해당 없음'은 '값 없음'과 다르다** — 그 종류가 그 필드를 갖지 않는다. */
  it("해당 없음은 —다", () => {
    expect(valueState(undefined)).toEqual({ kind: "state", label: m.logs.none });
  });

  it("다섯 갈래의 라벨이 서로 다르다", () => {
    const labels = [valueState(""), valueState(" "), valueState(null), valueState({ unavailable: true }), valueState(undefined)]
      .map((value) => (value.kind === "state" ? value.label : ""));
    expect(new Set(labels).size).toBe(5);
  });
});

describe("groupByDay — UTC 자정으로 끊는다", () => {
  const NOW = new Date("2026-09-20T02:00:00.000Z");
  const at = (iso: string) => ({ occurredAt: new Date(iso) });

  it("오늘·어제는 낱말이고 나머지는 날짜다", () => {
    const groups = groupByDay(
      [at("2026-09-20T01:00:00Z"), at("2026-09-19T23:59:59Z"), at("2026-09-18T00:00:00Z")],
      NOW,
    );
    expect(groups.map((group) => group.label)).toEqual([m.logs.day.today, m.logs.day.yesterday, "2026-09-18"]);
  });

  /**
   * ⚠️ **로컬 자정이 아니다.** KST 09-20 08:00은 UTC 09-19 23:00이라 `Today`가 아니라 `Yesterday`다 —
   * 로컬로 끊으면 밤 사이 실행이 하루 어긋난다 (POSTMORTEM 2026-09-19 항목의 계열).
   */
  it("UTC 자정 직전·직후가 다른 카드다", () => {
    const groups = groupByDay([at("2026-09-20T00:00:00.000Z"), at("2026-09-19T23:59:59.999Z")], NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.dayKey).toBe("2026-09-20");
    expect(groups[1]?.dayKey).toBe("2026-09-19");
  });

  it("같은 날은 한 카드에 순서대로 들어간다", () => {
    const rows = [at("2026-09-20T05:00:00Z"), at("2026-09-20T01:00:00Z")];
    const groups = groupByDay(rows, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toEqual(rows);
  });

  it("빈 목록은 빈 배열이다", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });

  /** ⚠️ **`now`를 서버가 하나 내린다** — 행마다 만들면 기준이 흔들린다. */
  it("now가 하루 뒤면 같은 행이 Yesterday로 옮겨간다", () => {
    const groups = groupByDay([at("2026-09-20T01:00:00Z")], new Date("2026-09-21T00:00:01Z"));
    expect(groups[0]?.label).toBe(m.logs.day.yesterday);
  });

  it("미래 행도 날짜로 그린다 — 던지지 않는다", () => {
    const groups = groupByDay([at("2026-09-25T01:00:00Z")], NOW);
    expect(groups[0]?.dayKey).toBe("2026-09-25");
  });
});

describe("coverageBoundaryIndex — 수집 공백 경계선", () => {
  const START = new Date("2026-09-10T00:00:00.000Z");
  const at = (iso: string) => ({ occurredAt: new Date(iso) });

  it("개시 시각을 모르면 그리지 않는다 — 추정값을 만들지 않는다", () => {
    expect(coverageBoundaryIndex([at("2026-09-01T00:00:00Z")], null, null)).toBe(-1);
  });

  it("경계가 페이지 중간에 있으면 그 행의 인덱스를 낸다", () => {
    const rows = [at("2026-09-12T00:00:00Z"), at("2026-09-11T00:00:00Z"), at("2026-09-09T00:00:00Z")];
    expect(coverageBoundaryIndex(rows, START, null)).toBe(2);
  });

  it("첫 행부터 과거면 0이다", () => {
    expect(coverageBoundaryIndex([at("2026-09-09T00:00:00Z")], START, null)).toBe(0);
  });

  it("개시 시각 정각은 수집 범위 안이다", () => {
    expect(coverageBoundaryIndex([at("2026-09-10T00:00:00.000Z")], START, null)).toBe(-1);
    expect(coverageBoundaryIndex([at("2026-09-09T23:59:59.999Z")], START, null)).toBe(0);
  });

  it("전부 수집 범위 안이면 그리지 않는다", () => {
    expect(coverageBoundaryIndex([at("2026-09-12T00:00:00Z")], START, null)).toBe(-1);
  });

  /** ⚠️ **선이 두 번 그려지지 않는다** (spec §7.1) — 커서가 이미 과거면 후속 페이지는 안 그린다. */
  it("커서가 이미 개시 이전이면 후속 페이지엔 반복하지 않는다", () => {
    const cursor = { occurredAt: new Date("2026-09-05T00:00:00Z"), id: "evt_1" };
    expect(coverageBoundaryIndex([at("2026-09-04T00:00:00Z")], START, cursor)).toBe(-1);
  });

  it("커서가 개시 이후면 이 페이지에서 경계가 드러난다", () => {
    const cursor = { occurredAt: new Date("2026-09-12T00:00:00Z"), id: "evt_1" };
    const rows = [at("2026-09-11T00:00:00Z"), at("2026-09-08T00:00:00Z")];
    expect(coverageBoundaryIndex(rows, START, cursor)).toBe(1);
  });

  it("커서가 개시 정각이면 아직 과거가 아니다 — 이 페이지가 선을 든다", () => {
    const cursor = { occurredAt: START, id: "evt_1" };
    expect(coverageBoundaryIndex([at("2026-09-09T00:00:00Z")], START, cursor)).toBe(0);
  });

  it("필터로 과거만 남아도 첫 페이지면 0이다", () => {
    const rows = [at("2026-09-08T00:00:00Z"), at("2026-09-07T00:00:00Z")];
    expect(coverageBoundaryIndex(rows, START, null)).toBe(0);
  });

  it("빈 페이지는 그리지 않는다", () => {
    expect(coverageBoundaryIndex([], START, null)).toBe(-1);
  });
});

describe("summarizeImportEvent — 소스별 결과 → 결과 어휘", () => {
  function result(status: SurfaceImportResult["status"], over: Partial<SurfaceImportResult> = {}): SurfaceImportResult {
    return { surfaceSlug: "web", status, count: 0, failed: 0, reason: null, errors: [], ...over };
  }

  it("전 소스 성공은 Imported다", () => {
    expect(summarizeImportEvent([result("imported"), result("imported")])).toBe("imported");
  });

  it("갈리면 Partially completed다", () => {
    expect(summarizeImportEvent([result("imported"), result("failed")])).toBe("partial");
    expect(summarizeImportEvent([result("imported"), result("superseded")])).toBe("partial");
    expect(summarizeImportEvent([result("partial")])).toBe("partial");
  });

  it("전부 대체됐으면 Superseded다", () => {
    expect(summarizeImportEvent([result("superseded", { reason: "superseded" }), result("superseded", { reason: "lease-lost" })])).toBe("superseded");
  });

  it("성공이 하나도 없고 실패가 섞이면 Failed다", () => {
    expect(summarizeImportEvent([result("failed")])).toBe("failed");
    expect(summarizeImportEvent([result("failed"), result("superseded")])).toBe("failed");
  });

  /** ⚠️ **빈 결과를 전체 성공으로 접지 않는다** — `summarizeImport`의 기존 판정과 같다. */
  it("빈 결과는 Failed다", () => {
    expect(summarizeImportEvent([])).toBe("failed");
  });
});

it("Import 보조줄 판정은 남은 편집과 소스별 결과를 함께 보존한다", async () => {
  const { eventMeta } = await import("../view");
  const parts = eventMeta({ kind: "IMPORT", subtype: "import.run", result: "imported", actor: { kind: "USER" }, run: null,
    payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["web"], keys: 4, pendingEdits: 2,
      surfaces: [{ surfaceSlug: "web", status: "imported", count: 4, reason: null }], errorCode: null, refusal: null } }, false);
  expect(parts).toContain(m.repositorySync.kept(2));
  expect(parts).toContain(`web: ${m.logs.status.imported}, ${m.logs.meta.keys(4)}`);
});

it("소스 추가는 다음 CI에서 적용할 선언이라고 표시하지 않는다", async () => {
  const { eventMeta } = await import("../view");
  expect(eventMeta({ kind: "SURFACE", subtype: "surface.added", result: null, actor: { kind: "USER" }, run: null,
    payload: { kind: "SURFACE", surfaceSlug: "web", adapter: "json-catalog", baseLocale: { before: null, after: "en" } } }, false))
    .not.toContain(m.logs.meta.declarationOnly);
});

/** delivery-invariants D7 — 보류만 남은 Publish는 "Nothing to send"가 아니다. 모달의 `Not sent`와 같은 낱말이다(DESIGN §10.1). */
describe("eventView — 보류만 남은 Publish", () => {
  it("notSent는 Not sent이고 warning이다 — Nothing to send와 다르다", () => {
    const view = eventView(row({ result: "notSent" }));
    expect(view.label).toBe(m.logs.status.notSent);
    expect(view.label).not.toBe(m.logs.status.skipped);
    expect(view.tone).toBe("warning");
  });
});
