import { baseLocaleFieldValue } from "@/lib/onboarding/base-pending";

export type BaseLanguageState = {
  serverValue: string;
  baseline: string;
  draft: string;
  submitted: { value: string; serverValue: string } | null;
  pending: boolean;
  result: "idle" | "saved" | { error: string };
};
export function createBaseLanguageForm(input: Parameters<typeof baseLocaleFieldValue>[0]): BaseLanguageState {
  const value = baseLocaleFieldValue(input) ?? "";
  return { serverValue: value, baseline: value, draft: value, submitted: null, pending: false, result: "idle" };
}
export function planBaseLanguageForm(state: BaseLanguageState, event:
  | { type: "change" | "refresh"; value: string }
  | { type: "submit" | "success" }
  | { type: "failure"; error: string },
): BaseLanguageState {
  switch (event.type) {
    case "change": return state.pending ? state : { ...state, draft: event.value, result: "idle" };
    case "refresh": {
      // 성공 응답 뒤 같은 옛 props를 다시 받는 것은 새 서버값이 아니다.
      if (state.serverValue === event.value) return state;
      const clean = !state.pending && state.draft === state.baseline;
      return { ...state, serverValue: event.value, baseline: event.value, draft: clean ? event.value : state.draft };
    }
    case "submit": return { ...state, pending: true, submitted: { value: state.draft, serverValue: state.serverValue }, result: "idle" };
    case "success": {
      if (!state.submitted) return state;
      const value = state.serverValue === state.submitted.serverValue ? state.submitted.value : state.serverValue;
      return { ...state, draft: value, baseline: value, submitted: null, pending: false, result: "saved" };
    }
    case "failure": return { ...state, submitted: null, pending: false, result: { error: event.error } };
  }
}
