// 클라이언트의 옛 해시 복귀용 잎 상수다. 파서·파일 읽기 모듈을 import하지 않는다.
export const LEGACY_ANCHORS = {
  "how-it-works": "/docs/sync#how-it-works",
  workflow: "/docs/create/workflow#workflow",
  "allowed-actions": "/docs/create/allowed-actions#allowed-actions",
  formats: "/docs/reference/formats#formats",
  limits: "/docs/reference/limits#limits",
  merging: "/docs/sync/merging#merging",
  nightly: "/docs/sync/nightly#nightly",
} as const;

/**
 * **섹션·페이지로 나뉜 페이지의 옛 절 id** — 키는 옛 절이 있던 페이지(지금은 그 장 개요이거나 남은 페이지)의 slug다 (malmoi#152). `ai-agents.md` 한 페이지를 `ai-agents/`로
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
  // `account.md`가 `account/profile.md`로 내려가고 `/docs/account`는 장 개요가 됐다 — 옛 절 id 다섯이 개요 맨 위에 멈춘다.
  account: {
    profile: "/docs/account/profile#profile",
    "sign-in-methods": "/docs/account/profile#sign-in-methods",
    "github-connection": "/docs/account/profile#github-connection",
    sessions: "/docs/account/profile#sessions",
    next: "/docs/account/profile#next",
  },
  // 프로젝트 만들기가 호스트별 장(`create/`)으로 갈렸다(2026-10-13, `host-split.test.ts`). 옛 `setup/create-project`는
  // `LEGACY_PAGES`가 장 개요로 보내고 해시는 남는다 — 개요엔 절이 없으니 옛 절 id 전부를 주 호스트(GitHub) 페이지로 보낸다.
  create: {
    "connect-github": "/docs/create/github#connect-github",
    "connect-gitlab": "/docs/create/gitlab#connect-gitlab",
    "choose-files": "/docs/create/github#choose-files",
    "confirm-project": "/docs/create/github#confirm-project",
    "finish-setup": "/docs/create/github#finish-setup",
    next: "/docs/create/github#next",
  },
  "create/workflow": {
    "gitlab-ci": "/docs/create/gitlab-ci#gitlab-ci",
  },
  "sync/merging": {
    "merging-gitlab": "/docs/sync/merging-gitlab#merging-gitlab",
  },
  // `reference/troubleshooting`이 호스트별 두 페이지로 갈렸다 — 옛 페이지는 `LEGACY_PAGES`가 GitHub 쪽으로 보내고, GitLab 절만 여기서 옮긴다.
  "reference/troubleshooting-github": {
    "gitlab-access": "/docs/reference/troubleshooting-gitlab#gitlab-access",
  },
};

/**
 * **사라진 페이지 slug → 새 페이지 경로.** `language.md`가 `account/preferences.md`로 옮겨 `/docs/language`가 404가 됐다.
 * 서버 리다이렉트라 해시를 볼 수 없다 — 브라우저가 Location에 해시가 없으면 원래 해시를 붙여 주므로, 대상 페이지가 옛 절
 * id를 그대로 지키는 것이 이 표의 전제다(`structure.test.ts`가 본다).
 */
export const LEGACY_PAGES: Readonly<Record<string, string>> = {
  language: "/docs/account/preferences",
  // 2026-10-13 — 프로젝트 만들기를 호스트별 장(`create/`)으로 옮겼다. 옛 절 id는 `SECTION_LEGACY_ANCHORS`의 `create`가 받는다.
  "setup/create-project": "/docs/create",
  "setup/connect-github": "/docs/create/github",
  "setup/connect-gitlab": "/docs/create/gitlab",
  "setup/workflow": "/docs/create/workflow",
  "setup/allowed-actions": "/docs/create/allowed-actions",
  "setup/gitlab-ci": "/docs/create/gitlab-ci",
  "reference/troubleshooting": "/docs/reference/troubleshooting-github",
};
