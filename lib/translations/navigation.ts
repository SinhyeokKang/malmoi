/**
 * 미저장 전환 정책 (translation-rework — spec §3.5 · §3.6).
 *
 * 다섯 전환 경로 + 뒤로/앞으로 + Sync가 같은 폐기 확인창이다. Publish는 draft를 **보존한 채** 기존 미리보기로 가고,
 * Revert는 draft가 있으면 막힌다. 여러 키 draft를 쌓지 않으므로 확인 대상은 현재 키의 변경 로케일뿐이다.
 */
export type EditorIntent =
  | { kind: "select-key"; target: string }
  | { kind: "tree" | "link"; target: string }
  | { kind: "filter" | "search" | "clear" | "history" | "sync" | "publish" | "revert" };

export type NavigationPlan =
  | { action: "go" }
  | { action: "stay" }
  | { action: "confirm"; dialog: "discard" | "publish-unsaved"; locales: string[] }
  | { action: "block"; reason: "unsaved" | "busy" };

export function planEditorNavigation(
  state: { dirtyLocales: readonly string[]; saving: boolean; current: string | undefined },
  intent: EditorIntent,
): NavigationPlan {
  if (intent.kind === "select-key" && intent.target === state.current) return { action: "stay" };
  const commands = intent.kind === "revert" || intent.kind === "sync" || intent.kind === "publish";
  if (commands && state.saving) return { action: "block", reason: "busy" };
  if (state.dirtyLocales.length === 0) return { action: "go" };
  const locales = [...state.dirtyLocales];
  if (intent.kind === "revert") return { action: "block", reason: "unsaved" };
  if (intent.kind === "publish") return { action: "confirm", dialog: "publish-unsaved", locales };
  return { action: "confirm", dialog: "discard", locales };
}
