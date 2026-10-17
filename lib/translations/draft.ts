/**
 * 한 키 draft (translation-rework — spec §3.4 · design §4).
 *
 * 세 층을 섞지 않는다: `saved`(미저장·취소의 기준) · `draft`(입력) · `inFlight`(보낸 스냅샷).
 * ⚠️ **저장 중 받은 서버 값도 `saved`를 갱신한다** (POSTMORTEM 2026-09-12) — 안 그러면 실패 뒤 Escape가 옛 값을 되살린다.
 * ⚠️ 로케일 코드는 남이 정한 키라 레코드를 `Object.create(null)`로 만든다 — `{}`에 `__proto__`를 대입하면 키가 사라진다.
 */
import { isImeComposing } from "@/lib/keyboard";

type Values = Record<string, string>;

/** 공백만 입력은 미번역이다. 서버 저장과 draft의 성공 적용이 공유하고, 값이 있으면 앞뒤 공백도 보존한다. */
export function normalizeTranslationValue(value: string): string {
  return value.trim() === "" ? "" : value;
}

export type KeyDraftState = {
  keyId: string;
  /** 서버가 준 활성 로케일 순서. 미저장 목록이 이 순서를 따른다. */
  order: readonly string[];
  saved: Values;
  draft: Values;
  /**
   * 제거 예정 언어 — 읽기 전용으로 **얼린** 칸(locale-add design §6 · spec 23). 미저장 입력은 버리지 않고 `dirtyLocales`(이탈 확인·복구)에 남지만
   * 편집·제출에서 빠진다. 버리는 길은 셀 `reset`이다. 다음 서버 갱신이 읽기 전용을 싣지 않으면(제거 취소) 그 입력을 그대로 편집한다.
   * ⚠️ 막는 것은 서버 거부(`locale-removal-pending`)다 — 이 목록은 그 거부를 미리 피하는 표시일 뿐이다.
   */
  readOnly: readonly string[];
  inFlight?: { requestId: string; sent: Values };
};

export type KeyDraftAction =
  | { type: "edit"; locale: string; value: string }
  | { type: "reset"; locale: string }
  /** 세션 복구 사본의 입력 — 편집이 아니라 버린 적 없는 입력이라 얼린 칸에도 선다(다시 로그인한 탭이 그 입력을 잃지 않는다). */
  | { type: "restore"; locale: string; value: string }
  /** 저장 거부(`locale-removal-pending`)가 알린 언어를 다음 서버 상세 전에 얼린다 — 다시 누를 필요 없이 다른 언어만 저장하게 된다(시안 T1 ②′). */
  | { type: "freeze"; locales: readonly string[] }
  | { type: "discard" }
  | { type: "submit"; requestId: string }
  | { type: "success"; requestId: string; keyId: string; cells: readonly { localeCode: string; value: string }[] }
  | { type: "failure"; requestId: string }
  | { type: "server"; keyId: string; values: Readonly<Values>; readOnly?: readonly string[] };

function values(entries: Iterable<readonly [string, string]>): Values {
  const out = Object.create(null) as Values;
  for (const [code, value] of entries) out[code] = value;
  return out;
}

/** 활성 순서를 따르는 읽기 전용 목록 — 순서 밖의 코드·중복은 버린다. */
function readOnlyOf(order: readonly string[], readOnly: readonly string[]): string[] {
  const codes = new Set(readOnly);
  return order.filter(code => codes.has(code));
}

export function initKeyDraft(keyId: string, saved: Readonly<Values>, readOnly: readonly string[] = []): KeyDraftState {
  const order = Object.keys(saved);
  return { keyId, order, saved: values(order.map(code => [code, saved[code] ?? ""])), draft: values(order.map(code => [code, saved[code] ?? ""])), readOnly: readOnlyOf(order, readOnly) };
}

/** 미저장 — 얼린 칸도 센다(이탈 확인·세션 복구가 그 입력을 버리지 않는다). */
export function dirtyLocales(state: KeyDraftState): string[] {
  return state.order.filter(code => state.draft[code] !== state.saved[code]);
}

/** 저장에 실을 수 있는 미저장 — 얼린 칸을 뺀다. 저장 버튼·제출이 이것을 본다. */
export function savableLocales(state: KeyDraftState): string[] {
  return dirtyLocales(state).filter(code => !state.readOnly.includes(code));
}

export function reduceKeyDraft(state: KeyDraftState, action: KeyDraftAction): KeyDraftState {
  switch (action.type) {
    case "discard":
      return initKeyDraft(state.keyId, state.saved, state.readOnly);
    case "edit": {
      if (!Object.hasOwn(state.saved, action.locale) || state.readOnly.includes(action.locale)) return state;
      return { ...state, draft: values([...Object.entries(state.draft), [action.locale, action.value]]) };
    }
    case "restore": {
      if (!Object.hasOwn(state.saved, action.locale)) return state;
      return { ...state, draft: values([...Object.entries(state.draft), [action.locale, action.value]]) };
    }
    case "freeze":
      return { ...state, readOnly: readOnlyOf(state.order, [...state.readOnly, ...action.locales]) };
    case "reset": {
      if (!Object.hasOwn(state.saved, action.locale)) return state;
      return { ...state, draft: values([...Object.entries(state.draft), [action.locale, state.saved[action.locale] ?? ""]]) };
    }
    case "submit": {
      const dirty = savableLocales(state);
      // 전송 중 중복 제출과 바뀐 것 없는 제출은 요청을 만들지 않는다.
      if (state.inFlight !== undefined || dirty.length === 0) return state;
      return { ...state, inFlight: { requestId: action.requestId, sent: values(dirty.map(code => [code, state.draft[code] ?? ""])) } };
    }
    case "success": {
      if (state.inFlight?.requestId !== action.requestId || action.keyId !== state.keyId) return state;
      const saved = values(Object.entries(state.saved));
      const draft = values(Object.entries(state.draft));
      const sent = state.inFlight.sent;
      // 키 저장은 전부 성공하거나 실패한다. 응답에서 빠진 제출 셀은 정규화 후 DB와 같았던 no-op이다.
      const acknowledged = new Map(Object.entries(sent).map(([code, value]) => [code, normalizeTranslationValue(value)]));
      for (const cell of action.cells) acknowledged.set(cell.localeCode, cell.value);
      for (const [localeCode, value] of acknowledged) {
        const cell = { localeCode, value };
        if (!Object.hasOwn(saved, cell.localeCode)) continue;
        // 보낸 셀은 보낸 그대로인 입력에만 서버 정규화값을 입히고(뒤에 더 친 입력은 남긴다), 보내지 않은 셀은
        // `server`와 같게 미저장이 아닐 때만 따라간다 — 안 그러면 깨끗한 셀이 Not saved가 되어 남의 값을 덮는다.
        const follows = Object.hasOwn(sent, cell.localeCode)
          ? draft[cell.localeCode] === sent[cell.localeCode]
          : draft[cell.localeCode] === saved[cell.localeCode];
        saved[cell.localeCode] = cell.value;
        if (follows) draft[cell.localeCode] = cell.value;
      }
      return { keyId: state.keyId, order: state.order, saved, draft, readOnly: state.readOnly };
    }
    case "failure": {
      if (state.inFlight?.requestId !== action.requestId) return state;
      return { keyId: state.keyId, order: state.order, saved: state.saved, draft: state.draft, readOnly: state.readOnly };
    }
    case "server": {
      if (action.keyId !== state.keyId) return state;
      const order = Object.keys(action.values);
      const saved = values([]);
      const draft = values([]);
      for (const code of order) {
        const next = action.values[code] ?? "";
        // 미저장이 아닌 셀은 입력도 서버를 따라가고, 미저장 입력은 보존한다.
        draft[code] = !Object.hasOwn(state.saved, code) || state.draft[code] === state.saved[code] ? next : state.draft[code] ?? "";
        saved[code] = next;
      }
      // 읽기 전용은 매 갱신이 정한다 — 싣지 않으면 전부 편집 가능하다(제거 취소가 별도 복구 동작 없이 칸을 연다).
      return { ...state, order, saved, draft, readOnly: readOnlyOf(order, action.readOnly ?? []) };
    }
  }
}

export type DraftRecovery = { kind: "clear" } | { kind: "write"; keyId: string; saved: Values; draft: Values };

/** 세션 복구 사본 — 미저장이 남으면 최신 draft와 갱신된 기준을, 0이면 지운다. */
export function planDraftRecovery(state: KeyDraftState): DraftRecovery {
  return dirtyLocales(state).length === 0 ? { kind: "clear" } : { kind: "write", keyId: state.keyId, saved: state.saved, draft: state.draft };
}

/**
 * 입력 안의 키보드 — Enter는 줄바꿈, Ctrl/Cmd+Enter는 키 저장, Escape는 현재 입력 취소.
 * IME 조합 중의 키는 조합의 것이다 — 판정은 `isImeComposing`(`isComposing`과 `keyCode 229` 둘 다. 하나만 보면 브라우저에 따라 조합 확정 Enter가 저장이 된다).
 * 호출부는 `event.nativeEvent`를 통째로 넘긴다 — 필드를 골라 옮기면 조합 판정식의 사본이 그 자리에 생긴다.
 */
export function keyEditCommand(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "isComposing" | "keyCode">): "save" | "reset" | null {
  if (isImeComposing(event)) return null;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) return "save";
  if (event.key === "Escape") return "reset";
  return null;
}
