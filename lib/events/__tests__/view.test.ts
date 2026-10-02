import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";
import type { SurfaceImportResult } from "@/lib/import/result";
import { importFailureMessage } from "@/lib/projects/import-failure";

import { EVENT_KINDS, EVENT_RESULTS, type EventResult, type SurfaceOutcome } from "../payload";
import { STATE, type StateKey, type StateTone, type StateVariant } from "@/lib/status/canon";
import {
  coverageBoundaryIndex,
  eventGlyph,
  eventMeta,
  eventView,
  eventResultState,
  surfaceResultState,
  logsResultTone,
  TONES,
  groupByDay,
  importReasonMessage,
  planArchivedReason,
  refusalMessage,
  summarizeImportEvent,
  valueState,
  type EventViewRow,
} from "../view";

/**
 * Logs 행의 순수 판정 (logs-rework design §6).
 * 화면이 `kind`로 삼항을 엮으면 갈래가 JSX 안에 흩어지고 그 자리에는 누락을 잡는 장치가 없다.
 */

function row(over: Partial<EventViewRow> = {}): EventViewRow {
  return { kind: "PUBLISH", result: "sent", warnings: 0, errorCode: null, ...over };
}

describe("eventView — 결과 어휘 전부", () => {
  /**
   * 전제가 "(종류, 결과)마다"다 (ux-drift-unify 1-Y2) — 진행 중은 종류가 낱말을 정한다(Sync `Syncing…` · Publish `Publishing…`).
   * 전에는 결과 하나에 낱말 하나(`Running…`)였다.
   */
  it("실행 종류마다 전부 라벨을 갖고, 한 종류 안에서 서로 다르다", () => {
    for (const kind of ["IMPORT", "PUBLISH"] as const) {
      const labels = EVENT_RESULTS.map((result) => eventView(row({ kind, result })).label);
      expect(labels.filter((label) => label !== null), kind).toHaveLength(EVENT_RESULTS.length);
      expect(new Set(labels).size, kind).toBe(EVENT_RESULTS.length);
    }
  });

  it("진행 중은 Sync면 Syncing…, Publish면 Publishing…다 — Running…을 쓰지 않는다", () => {
    expect(eventView(row({ kind: "IMPORT", result: "running" })).label).toBe("Syncing…");
    expect(eventView(row({ kind: "PUBLISH", result: "running" })).label).toBe("Publishing…");
  });

  /** Logs는 결과에서 종류를 빼고 말한다(Q1) — 종류 배지가 앞에 선다. 다른 화면은 종류가 없어 "Sync failed"다. */
  it("Sync 실패의 결과 배지는 Failed다", () => {
    expect(eventView(row({ kind: "IMPORT", result: "failed" })).label).toBe("Failed");
  });

  it("실패만 danger다", () => {
    expect(eventView(row({ result: "failed", errorCode: "github-error" })).tone).toBe("danger");
  });

  it("사람이 고쳐야 풀리는 셋은 warning이다", () => {
    for (const result of ["deferred", "partial", "notStarted", "notSent"] as const) {
      expect(eventView(row({ result })).tone, result).toBe("warning");
    }
  });

  /**
   * **Logs의 성공은 조용하다** (D3③ 예외 — 이력은 성공이 대부분이라 초록이 배경이 된다). Sent·Synced 둘 다다. ⚠️ 공유 결과 톤(`TONES`)은
   * 성공 = `success`를 유지한다 — Home Sync 결과 Alert가 그것을 읽는다(`summarizeImport`). 예외는 Logs 표시 층(`logsResultTone`)이 든다.
   */
  it("성공 둘은 Logs에서 muted이고 공유 톤은 success 그대로다", () => {
    for (const result of ["sent", "imported"] as const) {
      expect(eventView(row({ result })).tone, result).toBe("muted");
      expect(TONES[result], result).toBe("success");
    }
    for (const result of ["running", "nothingToSend", "superseded"] as const) expect(eventView(row({ result })).tone, result).toBe("muted");
  });

  it("성공 밖은 공유 톤 그대로다", () => {
    for (const result of EVENT_RESULTS.filter((r) => TONES[r] !== "success")) expect(logsResultTone(result), result).toBe(TONES[result]);
  });

  it("진행 중만 줄임표를 든다 (DESIGN §10)", () => {
    for (const kind of ["IMPORT", "PUBLISH"] as const) {
      expect(eventView(row({ kind, result: "running" })).label).toContain("…");
      for (const result of EVENT_RESULTS.filter((r) => r !== "running")) {
        expect(eventView(row({ kind, result })).label, result).not.toContain("…");
      }
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
    // Logs의 성공은 무색이다(D3③ 예외) — 경고 수는 톤과 독립으로 붙는다.
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

  it("오늘·어제만 낱말이 붙고 나머지는 없다", () => {
    const groups = groupByDay(
      [at("2026-09-20T01:00:00Z"), at("2026-09-19T23:59:59Z"), at("2026-09-18T00:00:00Z")],
      NOW,
    );
    expect(groups.map((group) => group.label)).toEqual([m.logs.day.today, m.logs.day.yesterday, null]);
  });

  /** 카드 머리는 늘 날짜이고(앱의 날짜 형), 오늘·어제 낱말은 그 옆의 덧붙임이다 — 지난 날짜가 두 번 서지 않는다. */
  it("머리는 `utcDay` 형이고 그룹 키는 ISO 그대로다", () => {
    const groups = groupByDay(
      [at("2026-09-20T01:00:00Z"), at("2026-09-19T23:59:59Z"), at("2026-09-18T00:00:00Z")],
      NOW,
    );
    expect(groups.map((group) => group.heading)).toEqual(["Sep 20, 2026", "Sep 19, 2026", "Sep 18, 2026"]);
    expect(groups.map((group) => group.dayKey)).toEqual(["2026-09-20", "2026-09-19", "2026-09-18"]);
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
    return { surfaceSlug: "web", status, count: 0, failed: 0, unmanaged: 0, reason: null, errors: [], ...over };
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
      surfaces: [{ surfaceSlug: "web", status: "imported", count: 4, reason: null }], errorCode: null, refusal: null, deferReason: null, changedValues: null } }, false);
  expect(parts).toContain(m.repositorySync.kept(2));
  // 소스는 언제나 배지다(4-Y20) — 키 수는 사실 조각이다.
  expect(parts).toContainEqual({ kind: "badge", text: "web" });
  expect(parts).toContain(m.logs.meta.keys(4));
});

/**
 * **IMPORT 보조줄에 결과 낱말이 없다** (ux-drift-unify 4-Y20) — "web 12 keys partially synced"가 인라인에 남아 결과를 두 번 말했다.
 * 결과는 행 오른쪽 배지가, 소스별 결과는 상세가 든다. 소스는 TRANSLATION처럼 언제나 배지다.
 */
it("Import 보조줄은 소스를 배지로, 키 수를 합으로 싣고 결과 낱말을 싣지 않는다", () => {
  const parts = eventMeta({ kind: "IMPORT", subtype: "import.run", result: "partial", actor: { kind: "USER" }, run: null,
    payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["app", "web"], keys: null, pendingEdits: 0,
      surfaces: [{ surfaceSlug: "app", status: "partial", count: 3, reason: "partial-import" }, { surfaceSlug: "web", status: "superseded", count: null, reason: "superseded" }],
      errorCode: null, refusal: null, deferReason: null, changedValues: null } }, false);
  expect(parts).toContainEqual({ kind: "badge", text: "app" });
  expect(parts).toContainEqual({ kind: "badge", text: "web" });
  expect(parts).toContain(m.logs.meta.keys(3));
  const text = parts.filter((p): p is string => typeof p === "string").join(" ").toLowerCase();
  for (const word of [m.logs.status.partial, m.logs.status.superseded, m.logs.status.failed, m.logs.status.imported]) expect(text).not.toContain(word.toLowerCase());
});

/**
 * **결과 글리프 칸도 §2.4 톤을 따른다** (D3③) — 별도 팔레트였던 결과 칩을 결과 톤에서 읽는다. Logs의 성공은 무색이다(예외 2). 종류 칩(파랑·청록·보라)만 별도 축이다.
 */
describe("eventGlyph — 결과 칩 톤", () => {
  const COLOR = { success: "green", muted: "slate", warning: "amber", danger: "red" } as const;
  it.each(EVENT_RESULTS)("%s의 칩은 Logs 결과 톤의 색이다", (result) => {
    for (const kind of ["IMPORT", "PUBLISH"] as const) {
      expect(eventGlyph({ kind, result, subtype: "x" }).tone).toBe(COLOR[logsResultTone(result)]);
    }
  });
  it("성공 실행의 칩은 초록이 아니다", () => {
    expect(eventGlyph({ kind: "PUBLISH", result: "sent", subtype: "publish.run" }).tone).toBe("slate");
    expect(eventGlyph({ kind: "IMPORT", result: "imported", subtype: "import.run" }).tone).toBe("slate");
  });
  it("비실행 사건은 종류 색이다", () => {
    expect(eventGlyph({ kind: "TRANSLATION", result: null, subtype: "translation.saved" }).tone).toBe("blue");
  });
});

/** 야간 재시도 절은 사전 값이다(2-W9) — 글자 일치에 기대는 리터럴 사본을 두지 않는다. */
it("야간 재시도 절이 사전의 사유 문장 안에 그대로 있다 — 공허한 치환이 아니다", () => {
  expect(m.logs.reasons.unknown).toContain(m.logs.nightlyRetry);
  expect(planArchivedReason("unknown", true)).not.toContain(m.logs.nightlyRetry);
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

/**
 * 거부·적재 실패 코드 → 문장 (audit #74 — 테스트 없는 export였다). 코드는 DB에서 읽은 남의 문자열이라
 * **모르는 값과 프로토타입 이름이 폴백으로 떨어지는지**가 요지이고, 짝으로 알려진 값이 제 문장을 받는지 본다.
 */
describe("refusalMessage", () => {
  it("거부 여섯은 제 문장, 모르는 코드·null·프로토타입 이름은 폴백이다", () => {
    expect(refusalMessage("stale-commit")).toBe(m.logs.refusals["stale-commit"]);
    expect(refusalMessage("archived")).toBe(m.logs.refusals.archived);
    for (const code of [null, "too-soon", "constructor", "__proto__", "toString"]) {
      expect(refusalMessage(code)).toBe(m.logs.refusals.fallback);
    }
  });
});

describe("importReasonMessage", () => {
  it("적재 실패 코드 → 동기화 오류 코드 → 폴백 순으로 읽는다", () => {
    expect(importReasonMessage("parse-failed")).toBe(importFailureMessage("parse-failed"));
    expect(importFailureMessage("parse-failed")).not.toBe(m.projects.importFailure.importFailed);
    expect(importReasonMessage("superseded")).toBe(m.repositorySync.errors.superseded);
    for (const code of [null, "unknown-code", "constructor", "hasOwnProperty"]) {
      expect(importReasonMessage(code)).toBe(m.projects.importFailure.importFailed);
    }
  });
});

/**
 * **reconfirm으로 멈춘 Publish** (mcp-connector T6.5 r1). SKIPPED 행이지만 편집은 있었고 아무것도 안 보냈다 — `Not sent`로 서고, 사유 문장이
 * `m.logs.reasons.reconfirm`이다. 조회(`eventResult`)가 notSent로 옮기고 여기서는 그 결과 + 코드로 사유를 고른다.
 */
describe("reconfirm Publish — Not sent + 사유", () => {
  it("notSent + reconfirm이면 reasonKey가 reconfirm이다 · 다른 notSent는 사유가 없다 (짝)", () => {
    expect(eventView(row({ result: "notSent", errorCode: "reconfirm" })).reasonKey).toBe("reconfirm");
    expect(eventView(row({ result: "notSent", errorCode: null })).reasonKey).toBeNull();
  });

  it("메타 줄 끝에 reconfirm 문장이 선다 · 보류로 인한 notSent에는 없다 (짝)", async () => {
    const { eventMeta } = await import("../view");
    const meta = (errorCode: string | null) => eventMeta({ kind: "PUBLISH", subtype: "publish.run", result: "notSent", actor: { kind: "USER" },
      payload: { kind: "PUBLISH", surfaceSlugs: ["a"], refusal: null }, run: { changed: null, prUrl: null, errorCode } }, false);
    expect(meta("reconfirm").at(-1)).toBe(m.logs.reasons.reconfirm);
    expect(meta(null)).not.toContain(m.logs.reasons.reconfirm);
  });
});

/** 결과의 상태 키·낱말·표시 톤을 독립된 기대값으로 고정한다 — 정본을 복사해 기대값으로 쓰지 않는다. */
describe("Logs 결과의 상태 키", () => {
  const expected = {
    running: ["syncing", "Syncing…", "muted", "soft-neutral"],
    sent: ["logsSent", "Sent", "muted", "soft-neutral"],
    nothingToSend: ["nothingToSend", "Nothing to send", "muted", "soft-neutral"],
    notSent: ["heldBack", "Held back", "warning", "soft-amber"],
    imported: ["logsSynced", "Synced", "muted", "soft-neutral"],
    deferred: ["held", "Held", "warning", "soft-amber"],
    partial: ["partiallySynced", "Partially synced", "warning", "soft-amber"],
    superseded: ["superseded", "Superseded", "muted", "soft-neutral"],
    notStarted: ["notStarted", "Not started", "warning", "soft-amber"],
    failed: ["logsFailed", "Failed", "danger", "soft-red"],
    upToDate: ["upToDate", "Up to date", "muted", "soft-neutral"],
  } as const satisfies Record<EventResult, readonly [StateKey, string, StateTone, StateVariant]>;

  it.each(EVENT_KINDS)("%s의 결과 전부가 기존 낱말·색의 상태 키다", (kind) => {
    for (const result of EVENT_RESULTS) {
      const [key, label, tone, variant] = result === "running" && kind === "PUBLISH"
        ? ["publishing", "Publishing…", "muted", "soft-neutral"] as const : expected[result];
      const state = eventResultState(kind, result);
      expect(state, result).toBe(key);
      expect(STATE[state], result).toEqual({ label, tone, variant });
      expect(eventView(row({ kind, result }))).toMatchObject({ state, label, tone });
    }
  });

  const surfaceStatuses = { imported: true, partial: true, failed: true, superseded: true } satisfies Record<SurfaceOutcome["status"], true>;
  it.each(Object.keys(surfaceStatuses) as SurfaceOutcome["status"][])("surface %s도 같은 Logs 상태다", (status) => {
    const [key, label, tone, variant] = expected[status];
    expect(surfaceResultState(status)).toBe(key);
    expect(STATE[surfaceResultState(status)]).toEqual({ label, tone, variant });
  });

  it("결과가 없는 사건은 상태 슬롯이 없고 경고·재확인 문구는 독립이다", () => {
    expect(eventView(row({ kind: "MEMBER", result: null }))).toMatchObject({ state: null, label: null, tone: "muted" });
    expect(eventView(row({ result: "notSent", errorCode: "reconfirm", warnings: 2 }))).toMatchObject({ state: "heldBack", label: "Held back", reasonKey: "reconfirm", warningsLabel: m.logs.warnings(2) });
    expect(TONES.sent).toBe("success");
    expect(TONES.imported).toBe("success");
  });
});
