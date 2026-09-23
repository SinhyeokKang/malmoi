/**
 * 한 키 draft (translation-rework — spec §3.4 · design §4).
 *
 * 세 층을 섞지 않는다: `saved`(미저장·취소의 기준) · `draft`(입력) · `inFlight`(보낸 스냅샷).
 * ⚠️ **저장 중 받은 서버 값도 `saved`를 갱신한다** (POSTMORTEM 2026-09-12) — 안 그러면 실패 뒤 Escape가 옛 값을 되살린다.
 * ⚠️ 로케일 코드는 남이 정한 키라 레코드를 `Object.create(null)`로 만든다 — `{}`에 `__proto__`를 대입하면 키가 사라진다.
 */
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
  inFlight?: { requestId: string; sent: Values };
};

export type KeyDraftAction =
  | { type: "edit"; locale: string; value: string }
  | { type: "reset"; locale: string }
  | { type: "discard" }
  | { type: "submit"; requestId: string }
  | { type: "success"; requestId: string; keyId: string; cells: readonly { localeCode: string; value: string }[] }
  | { type: "failure"; requestId: string }
  | { type: "server"; keyId: string; values: Readonly<Values> };

function values(entries: Iterable<readonly [string, string]>): Values {
  const out = Object.create(null) as Values;
  for (const [code, value] of entries) out[code] = value;
  return out;
}

export function initKeyDraft(keyId: string, saved: Readonly<Values>): KeyDraftState {
  const order = Object.keys(saved);
  return { keyId, order, saved: values(order.map(code => [code, saved[code] ?? ""])), draft: values(order.map(code => [code, saved[code] ?? ""])) };
}

export function dirtyLocales(state: KeyDraftState): string[] {
  return state.order.filter(code => state.draft[code] !== state.saved[code]);
}

export function reduceKeyDraft(state: KeyDraftState, action: KeyDraftAction): KeyDraftState {
  switch (action.type) {
    case "discard":
      return initKeyDraft(state.keyId, state.saved);
    case "edit": {
      if (!Object.hasOwn(state.saved, action.locale)) return state;
      return { ...state, draft: values([...Object.entries(state.draft), [action.locale, action.value]]) };
    }
    case "reset": {
      if (!Object.hasOwn(state.saved, action.locale)) return state;
      return { ...state, draft: values([...Object.entries(state.draft), [action.locale, state.saved[action.locale] ?? ""]]) };
    }
    case "submit": {
      const dirty = dirtyLocales(state);
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
      return { keyId: state.keyId, order: state.order, saved, draft };
    }
    case "failure": {
      if (state.inFlight?.requestId !== action.requestId) return state;
      return { keyId: state.keyId, order: state.order, saved: state.saved, draft: state.draft };
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
      return { ...state, order, saved, draft };
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
 * IME 조합 중의 키는 조합의 것이다 — `isComposing`과 `keyCode 229`를 둘 다 본다(`SearchInput`과 같은 판정. 하나만 보면 브라우저에 따라 조합 확정 Enter가 저장이 된다).
 */
export function keyEditCommand(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): "save" | "reset" | null {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) return "save";
  if (event.key === "Escape") return "reset";
  return null;
}
