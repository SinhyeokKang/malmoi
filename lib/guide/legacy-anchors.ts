// 클라이언트의 옛 해시 복귀용 잎 상수다. 파서·파일 읽기 모듈을 import하지 않는다.
export const LEGACY_ANCHORS = {
  "how-it-works": "/docs/sync#how-it-works",
  workflow: "/docs/setup/workflow#workflow",
  "allowed-actions": "/docs/setup/allowed-actions#allowed-actions",
  formats: "/docs/reference/formats#formats",
  limits: "/docs/reference/limits#limits",
  merging: "/docs/sync/merging#merging",
  nightly: "/docs/sync/nightly#nightly",
} as const;

/**
 * **섹션으로 나뉜 페이지의 옛 절 id** — 키는 그 섹션 개요의 slug다 (malmoi#152). `ai-agents.md` 한 페이지를 `ai-agents/`로
 * 나눈 뒤 옛 `/docs/ai-agents#<id>`가 개요 맨 위에 멈췄다. `#next`는 옛 원고의 마지막 절이라 마지막 페이지(prompts)의 것으로 간다.
 */
export const SECTION_LEGACY_ANCHORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "ai-agents": {
    browser: "/docs/ai-agents/browser#browser",
    "browser-claude-code": "/docs/ai-agents/browser#browser-claude-code",
    "browser-codex": "/docs/ai-agents/browser#browser-codex",
    "browser-claude-ai": "/docs/ai-agents/browser#browser-claude-ai",
    "connected-apps": "/docs/ai-agents/browser#connected-apps",
    token: "/docs/ai-agents/token#token",
    connect: "/docs/ai-agents/token#connect",
    "claude-code": "/docs/ai-agents/token#claude-code",
    codex: "/docs/ai-agents/token#codex",
    cursor: "/docs/ai-agents/token#cursor",
    permissions: "/docs/ai-agents/permissions#permissions",
    "allowed-actions": "/docs/ai-agents/permissions#allowed-actions",
    tools: "/docs/ai-agents/permissions#tools",
    prompts: "/docs/ai-agents/prompts#prompts",
    "connect-repo": "/docs/ai-agents/prompts#connect-repo",
    "push-token": "/docs/ai-agents/prompts#push-token",
    "fill-and-publish": "/docs/ai-agents/prompts#fill-and-publish",
    next: "/docs/ai-agents/prompts#next",
  },
};
