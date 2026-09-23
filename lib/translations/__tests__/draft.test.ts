import { describe, expect, it } from "vitest";
import {
  dirtyLocales,
  initKeyDraft,
  keyEditCommand,
  planDraftRecovery,
  reduceKeyDraft,
  type KeyDraftState,
} from "../draft";

/**
 * 한 키 draft (translation-rework T3 — spec §3.4 · design §4 클라이언트 상태).
 *
 * 세 층을 섞지 않는다: **saved**(취소·미저장 판정의 기준) · **draft**(입력) · **inFlight**(보낸 스냅샷).
 * ⚠️ POSTMORTEM 2026-09-12 — 저장 중 받은 서버 값이 취소 기준을 갱신하지 않아, 실패 뒤 Escape가 옛 값을 되살렸다.
 */
const start = () => initKeyDraft("k1", { en: "Hello", ko: "안녕", ja: "" });
const edit = (s: KeyDraftState, locale: string, value: string) => reduceKeyDraft(s, { type: "edit", locale, value });
const submit = (s: KeyDraftState, requestId = "r1") => reduceKeyDraft(s, { type: "submit", requestId });

describe("dirtyLocales — 원문 문자열 비교", () => {
  it("입력이 기준과 다르면 미저장이다", () => {
    expect(dirtyLocales(edit(start(), "ko", "안녕하세요"))).toEqual(["ko"]);
  });

  it("다시 원래 값으로 돌아오면 미저장이 아니다", () => {
    expect(dirtyLocales(edit(edit(start(), "ko", "x"), "ko", "안녕"))).toEqual([]);
  });

  it("공백 차이도 미저장이다 — 정규화는 서버가 한다", () => {
    expect(dirtyLocales(edit(start(), "ja", "  "))).toEqual(["ja"]);
  });

  it("초기 로케일 순서를 지킨다", () => {
    expect(dirtyLocales(edit(edit(start(), "ja", "やあ"), "en", "Hi"))).toEqual(["en", "ja"]);
  });

  it("프로토타입 이름의 로케일도 한 칸이다", () => {
    // 리터럴 `{ __proto__: … }`는 프로토타입을 바꿀 뿐 own property를 만들지 않는다 — JSON.parse가 만든다.
    const s = initKeyDraft("k1", JSON.parse('{"__proto__":"a","constructor":"b"}') as Record<string, string>);
    expect(dirtyLocales(edit(s, "__proto__", "z"))).toEqual(["__proto__"]);
  });
});

describe("reduceKeyDraft — reset(Escape)은 현재 입력 하나만", () => {
  it("그 로케일만 기준으로 되돌린다", () => {
    const s = reduceKeyDraft(edit(edit(start(), "ko", "x"), "en", "y"), { type: "reset", locale: "ko" });
    expect(dirtyLocales(s)).toEqual(["en"]);
  });
});

describe("reduceKeyDraft — submit", () => {
  it("미저장 로케일만 스냅샷으로 보낸다", () => {
    const s = submit(edit(start(), "ko", "x"));
    expect(s.inFlight).toEqual({ requestId: "r1", sent: { ko: "x" } });
  });

  it("전송 중 중복 submit은 무시한다", () => {
    const first = submit(edit(start(), "ko", "x"));
    expect(submit(edit(first, "en", "y"), "r2").inFlight?.requestId).toBe("r1");
  });

  it("바뀐 것이 없으면 보내지 않는다", () => {
    expect(submit(start()).inFlight).toBeUndefined();
  });

  it("전송 중에도 입력은 계속 받는다", () => {
    const s = edit(submit(edit(start(), "ko", "x")), "ko", "xy");
    expect(s.draft.ko).toBe("xy");
  });
});

describe("reduceKeyDraft — success는 보낸 draft에만 적용한다", () => {
  it("성공하면 서버 값이 기준이 되고 미저장이 사라진다", () => {
    const s = reduceKeyDraft(submit(edit(start(), "ko", "x")), { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "x" }] });
    expect(dirtyLocales(s)).toEqual([]);
    expect(s.inFlight).toBeUndefined();
  });

  it("A 제출 후 B를 입력했으면 성공 뒤에도 B가 Not saved로 남는다", () => {
    const sent = submit(edit(start(), "ko", "A"));
    const s = reduceKeyDraft(edit(sent, "ko", "B"), { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "A" }] });
    expect(s.saved.ko).toBe("A");
    expect(s.draft.ko).toBe("B");
    expect(dirtyLocales(s)).toEqual(["ko"]);
  });

  it("공백만 보낸 셀은 서버가 준 빈 문자열로 draft까지 맞춘다", () => {
    const s = reduceKeyDraft(submit(edit(start(), "ja", "   ")), { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ja", value: "" }] });
    expect(s.draft.ja).toBe("");
    expect(dirtyLocales(s)).toEqual([]);
  });

  it("응답에 실린 보내지 않은 셀은 미저장이 아니면 입력도 서버 값을 따른다 — 깨끗한 셀이 Not saved가 되지 않는다", () => {
    const sent = submit(edit(start(), "ko", "x"));
    const s = reduceKeyDraft(sent, { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "x" }, { localeCode: "ja", value: "theirs" }] });
    expect(s.draft.ja).toBe("theirs");
    expect(dirtyLocales(s)).toEqual([]);
  });

  it("응답에 실린 보내지 않은 셀이 미저장이면 입력을 보존한다", () => {
    const sent = edit(submit(edit(start(), "ko", "x")), "en", "mine");
    const s = reduceKeyDraft(sent, { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "x" }, { localeCode: "en", value: "theirs" }] });
    expect(s.draft.en).toBe("mine");
    expect(s.saved.en).toBe("theirs");
  });

  it("다른 요청이나 다른 키의 늦은 응답은 적용하지 않는다", () => {
    const sent = submit(edit(start(), "ko", "x"));
    expect(reduceKeyDraft(sent, { type: "success", requestId: "old", keyId: "k1", cells: [{ localeCode: "ko", value: "x" }] })).toEqual(sent);
    expect(reduceKeyDraft(sent, { type: "success", requestId: "r1", keyId: "k2", cells: [{ localeCode: "ko", value: "x" }] })).toEqual(sent);
  });
});

describe("reduceKeyDraft — failure · server 교차 (POSTMORTEM 2026-09-12)", () => {
  it("실패는 draft를 유지하고 전송만 푼다", () => {
    const s = reduceKeyDraft(submit(edit(start(), "ko", "x")), { type: "failure", requestId: "r1" });
    expect(s.inFlight).toBeUndefined();
    expect(s.draft.ko).toBe("x");
    expect(dirtyLocales(s)).toEqual(["ko"]);
  });

  it("저장 중 서버 값 C를 받고 실패하면 Escape는 C로 돌아간다", () => {
    let s = submit(edit(start(), "ko", "B"));
    s = reduceKeyDraft(s, { type: "server", keyId: "k1", values: { en: "Hello", ko: "C", ja: "" } });
    s = reduceKeyDraft(s, { type: "failure", requestId: "r1" });
    s = reduceKeyDraft(s, { type: "reset", locale: "ko" });
    expect(s.draft.ko).toBe("C");
    expect(dirtyLocales(s)).toEqual([]);
  });

  it("서버 값은 미저장이 아닌 셀의 입력도 따라 바꾸고, 미저장 입력은 보존한다", () => {
    let s = edit(start(), "ko", "mine");
    s = reduceKeyDraft(s, { type: "server", keyId: "k1", values: { en: "Hi!", ko: "theirs", ja: "" } });
    expect(s.draft.en).toBe("Hi!");
    expect(s.draft.ko).toBe("mine");
    expect(s.saved.ko).toBe("theirs");
  });

  it("다른 키의 서버 값은 무시한다", () => {
    const s = edit(start(), "ko", "mine");
    expect(reduceKeyDraft(s, { type: "server", keyId: "k2", values: { ko: "x" } })).toEqual(s);
  });
});

describe("planDraftRecovery — 세션 복구 사본 (spec §3.4 · T15)", () => {
  it("미저장이 있으면 최신 draft와 기준을 기록한다", () => {
    const s = edit(start(), "ko", "x");
    expect(planDraftRecovery(s)).toEqual({ kind: "write", keyId: "k1", saved: s.saved, draft: s.draft });
  });

  it("A 제출 → B 추가 입력 → A 성공 뒤에도 사본을 남기고 갱신된 기준을 싣는다", () => {
    const sent = submit(edit(start(), "ko", "A"));
    const s = reduceKeyDraft(edit(sent, "en", "B"), { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "A" }] });
    const plan = planDraftRecovery(s);
    expect(plan).toMatchObject({ kind: "write", keyId: "k1" });
    if (plan.kind !== "write") throw new Error("unreachable");
    expect(plan.saved.ko).toBe("A");
    expect(plan.draft.en).toBe("B");
  });

  it("성공 응답 적용 뒤 미저장이 0이면 사본을 지운다", () => {
    const s = reduceKeyDraft(submit(edit(start(), "ko", "x")), { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "x" }] });
    expect(planDraftRecovery(s)).toEqual({ kind: "clear" });
  });
});

describe("keyEditCommand — 입력 안의 키보드 (spec §3.4)", () => {
  it("Enter는 줄바꿈이다 — 명령이 아니다", () => {
    expect(keyEditCommand({ key: "Enter" })).toBeNull();
    expect(keyEditCommand({ key: "Enter", shiftKey: true })).toBeNull();
  });

  it("Ctrl/Cmd+Enter는 키 저장이다", () => {
    expect(keyEditCommand({ key: "Enter", ctrlKey: true })).toBe("save");
    expect(keyEditCommand({ key: "Enter", metaKey: true })).toBe("save");
  });

  it("Escape는 현재 입력만 되돌린다", () => {
    expect(keyEditCommand({ key: "Escape" })).toBe("reset");
  });

  it("IME 조합 중에는 어떤 키도 명령으로 소비하지 않는다", () => {
    expect(keyEditCommand({ key: "Enter", metaKey: true, isComposing: true })).toBeNull();
    expect(keyEditCommand({ key: "Escape", keyCode: 229 })).toBeNull();
  });

  it("Tab·blur는 저장하지 않는다", () => {
    expect(keyEditCommand({ key: "Tab" })).toBeNull();
  });
});

it("서버가 no-op 셀을 생략해도 공백 정규화된 제출은 깨끗해진다", () => {
  const state = reduceKeyDraft(submit(edit(start(), "ja", "   ")), { type: "success", requestId: "r1", keyId: "k1", cells: [] });
  expect(state.saved.ja).toBe("");
  expect(state.draft.ja).toBe("");
  expect(dirtyLocales(state)).toEqual([]);
});

it("동일값 no-op 성공도 보낸 값을 기준으로 확정하고 제출 이후 입력은 보존한다", () => {
  const state = reduceKeyDraft(edit(submit(edit(start(), "ko", "A")), "ko", "B"), { type: "success", requestId: "r1", keyId: "k1", cells: [] });
  expect(state.saved.ko).toBe("A");
  expect(state.draft.ko).toBe("B");
  expect(dirtyLocales(state)).toEqual(["ko"]);
});

it("재검증에서 추가된 활성 로케일은 즉시 편집·제출할 수 있고 기존 미저장은 유지된다", () => {
  let state = edit(initKeyDraft("k1", { en: "Hello", ko: "안녕" }), "ko", "mine");
  state = reduceKeyDraft(state, { type: "server", keyId: "k1", values: { en: "Hello", ko: "theirs", fr: "Bonjour" } });
  state = edit(state, "fr", "Salut");
  expect(state.order).toEqual(["en", "ko", "fr"]);
  expect(state.saved.fr).toBe("Bonjour");
  expect(submit(state).inFlight?.sent).toEqual({ ko: "mine", fr: "Salut" });
});

it("활성 집합에서 빠진 로케일은 draft와 제출에서 빠지고 늦은 응답으로 되살아나지 않는다", () => {
  let state = submit(edit(start(), "ko", "mine"));
  state = reduceKeyDraft(state, { type: "server", keyId: "k1", values: { en: "Hello", ja: "" } });
  state = reduceKeyDraft(state, { type: "success", requestId: "r1", keyId: "k1", cells: [{ localeCode: "ko", value: "mine" }] });
  expect(state.order).toEqual(["en", "ja"]);
  expect(Object.hasOwn(state.saved, "ko")).toBe(false);
  expect(dirtyLocales(state)).toEqual([]);
});
