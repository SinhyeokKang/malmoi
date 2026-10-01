import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import type { EventPayload } from "../payload";
import { eventFailureMessage, eventMeta, eventSentence, type EventMetaRow } from "../view";

/**
 * nightly-sync F1 — 야간·CI 행의 문장과 보조줄. 주체는 `triggerOf`(subtype)가 정하고, 보류 문장은 `deferReason`이 가른다.
 */

type ImportPayload = Extract<EventPayload, { kind: "IMPORT" }>;

const payload = (over: Partial<ImportPayload> = {}): ImportPayload => ({
  kind: "IMPORT", source: "nightly", surfaceSlugs: ["web"], keys: null, pendingEdits: null, surfaces: [],
  errorCode: null, refusal: null, deferReason: null, changedValues: null, ...over,
});

const metaRow = (over: Partial<EventMetaRow> = {}): EventMetaRow => ({
  kind: "IMPORT", subtype: "nightly.skip", result: "upToDate", payload: payload(), actor: { kind: "AUTOMATION" }, run: null, ...over,
});

const sentence = (row: EventMetaRow): string =>
  renderToStaticMarkup(<>{eventSentence(row, { actor: "WHO", key: "" })}</>);

describe("eventSentence — 야간 스킵과 야간 적재", () => {
  it("upToDate는 '적재했다'가 아니라 할 일이 없었다고 말한다", () => {
    const text = sentence(metaRow());
    expect(text).toBe(renderToStaticMarkup(<>{m.logs.sentence.import.upToDate("WHO")}</>));
    expect(text).not.toContain("synced");
    expect(text.startsWith("WHO")).toBe(true);
  });

  it.each(["open-pr", "pr-check-failed", "too-large"] as const)("보류 %s는 사유별 문장이고 행위자로 시작한다", (reason) => {
    const text = sentence(metaRow({ result: "deferred", payload: payload({ deferReason: reason, pendingEdits: 0 }) }));
    expect(text).toBe(renderToStaticMarkup(<>{m.logs.sentence.import.held[reason]("WHO")}</>));
    expect(text.startsWith("WHO")).toBe(true);
  });

  it("사유 셋의 문장이 서로 다르다", () => {
    const texts = (["open-pr", "pr-check-failed", "too-large"] as const).map((reason) =>
      sentence(metaRow({ result: "deferred", payload: payload({ deferReason: reason }) })));
    expect(new Set(texts).size).toBe(3);
  });

  it("pending-edits·옛 보류(null)는 기존 소스 문장 그대로다", () => {
    const expected = renderToStaticMarkup(<>{m.logs.sentence.import.deferred("WHO", "web")}</>);
    for (const deferReason of ["pending-edits", null] as const) {
      expect(sentence(metaRow({ subtype: "import.ci", result: "deferred", payload: payload({ deferReason, pendingEdits: 2 }) }))).toBe(expected);
    }
  });

  it("야간 스킵 실패(base-unreadable)는 리포를 못 읽었다고 말한다 — 적재 실패 문장이 아니다", () => {
    const text = sentence(metaRow({ result: "failed", payload: payload({ errorCode: "base-unreadable" }) }));
    expect(text).toBe(renderToStaticMarkup(<>{m.logs.sentence.import.baseUnreadable("WHO")}</>));
    expect(text).not.toBe(renderToStaticMarkup(<>{m.logs.sentence.import.failed("WHO")}</>));
  });

  it("야간 적재(import.nightly)는 적재 문장을 쓴다", () => {
    const text = sentence(metaRow({ subtype: "import.nightly", result: "imported", payload: payload({ surfaceSlugs: ["web", "app"] }) }));
    expect(text).toBe(renderToStaticMarkup(<>{m.logs.sentence.import.imported("WHO", 2)}</>));
  });
});

describe("eventMeta — 주체 낱말과 보류 사유", () => {
  it("open-pr 보류는 '0 unsent edits'를 내지 않고 PR 사유를 말한다", () => {
    const parts = eventMeta(metaRow({ subtype: "import.ci", result: "deferred", payload: payload({ source: "ci", deferReason: "open-pr", pendingEdits: 0 }) }), false);
    expect(parts).not.toContain(m.logs.deferredReason(0));
    expect(parts).toContain(m.logs.deferReasons["open-pr"]);
  });

  it.each(["pr-check-failed", "too-large"] as const)("%s 보류도 편집 수가 아니라 사유를 말한다", (reason) => {
    const parts = eventMeta(metaRow({ result: "deferred", payload: payload({ deferReason: reason, pendingEdits: 0 }) }), false);
    expect(parts).toContain(m.logs.deferReasons[reason]);
    expect(parts.some((part) => typeof part === "string" && part.includes("unsent edit"))).toBe(false);
  });

  it("pending-edits 보류는 편집 수 문장 그대로다", () => {
    const parts = eventMeta(metaRow({ subtype: "import.ci", result: "deferred", payload: payload({ source: "ci", deferReason: "pending-edits", pendingEdits: 3 }) }), false);
    expect(parts).toContain(m.logs.deferredReason(3));
  });

  /** 행위자가 문장 머리에 선 자동화 행은 주체를 두 번 말하지 않는다. */
  it.each([
    ["야간 스킵", metaRow()],
    ["CI 적재", metaRow({ subtype: "import.ci", result: "imported", payload: payload({ source: "ci" }) })],
    ["야간 Publish", metaRow({ kind: "PUBLISH", subtype: "publish.run", result: "sent", payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: null },
      run: { changed: 1, prUrl: null, errorCode: null } })],
  ])("%s 보조줄은 주체를 종류와 합친 배지 하나로 든다 — 낱말을 따로 싣지 않는다", (_, row) => {
    const parts = eventMeta(row, false);
    // 옛 소문자 주체 낱말(사전에서 지웠다 — Home 메타 열도 실행 종류 배지를 쓴다, ux-drift-unify U7 r1)이 따로 서지 않는다.
    for (const word of ["manual", "nightly", "CI", "automatic"]) expect(parts).not.toContain(word);
    const expected = row.kind === "PUBLISH" ? m.logs.meta.runType.PUBLISH.nightly : row.subtype === "import.ci" ? m.logs.meta.runType.IMPORT.ci : m.logs.meta.runType.IMPORT.nightly;
    expect(parts[0]).toEqual({ kind: "badge", text: expected });
  });

  it("사람 행은 manual을 그대로 든다", () => {
    const parts = eventMeta(metaRow({ subtype: "import.run", result: "imported", actor: { kind: "USER" }, payload: payload({ source: "manual" }) }), false);
    // 종류와 주체가 한 배지다(2026-09-30 사용자 — `Manual sync`).
    expect(parts[0]).toEqual({ kind: "badge", text: m.logs.meta.runType.IMPORT.manual });
  });
});

/** 서버 적재 예산은 수동 Sync도 지난다 — too-large 문구가 [Sync]를 복구 수단으로 권하면 같은 이유로 또 실패한다. */
it("too-large 문구는 출구 둘(크기 줄이기 · 워크플로)을 든다 — 워크플로 없는 프로젝트에도 출구가 있다", () => {
  const text = m.logs.deferReasons["too-large"];
  expect(text).not.toMatch(/automatically|ask your developers to sync|can still deliver/);
  expect(text).toMatch(/Reduce/);
  expect(text).toContain("workflow");
  expect(renderToStaticMarkup(<>{m.logs.sentence.import.held["too-large"]("WHO")}</>)).not.toContain("automatically");
});

/** 야간 스킵 실패는 적재 사유 사전에 없는 코드다 — 폴백("import failed")이 아니라 Publish 사유 문장이고, 보관 중엔 야간 절이 빠진다. */
describe("eventFailureMessage — nightly.skip base-unreadable", () => {
  const skip = metaRow({ result: "failed", payload: payload({ errorCode: "base-unreadable" }) });

  it("base-unreadable 사유 문장을 낸다", () => {
    expect(eventFailureMessage(skip, false)).toBe(m.logs.reasons["base-unreadable"]);
    expect(eventFailureMessage(skip, false)).not.toBe(m.projects.importFailure.importFailed);
  });

  it("보관 중이면 야간 절이 빠진다", () => {
    expect(eventFailureMessage(skip, true)).not.toContain("nightly");
  });
});
