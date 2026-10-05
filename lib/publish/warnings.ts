import type { PullWarning } from "@/lib/pull/run";

/**
 * Publish 모달의 "보내지 않은 항목" — 표면·파일마다 한 묶음(처음 나온 순서). 실행은 경고를 코드로 싣고(ui-locales B1′)
 * 문장은 `describe`가 만든다 — 화면 언어의 사전을 고르는 것은 호출부다.
 */
export function summarizeWarnings(warnings: readonly PullWarning[], describe: (warning: PullWarning) => string) {
  const groups = new Map<string, string[]>();
  for (const warning of warnings) {
    const file = `${warning.surfaceSlug}: ${warning.path}`;
    const messages = groups.get(file) ?? [];
    messages.push(describe(warning));
    groups.set(file, messages);
  }
  return [...groups].map(([file, messages]) => ({ file, messages }));
}
