import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { withRepoHost } from "@/lib/i18n/host";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **spec 완료 조건 9 — GitLab 프로젝트 화면의 사전 스윕** (R-Eui 🟡1). 프로젝트 화면은 `withRepoHost(m, "gitlab")`로 사전 전체를 덮어 쓴다 —
 * 그 덮인 사전의 **프로젝트 범위 절**에 `GitHub`·`pull request`·`PR`·`github.com`이 0건이어야 한다. DOM 테스트가 화면 몇 조각만 재는 동안
 * 이 스윕이 나머지(배너·Sync·Publish·Logs·Sources·번역)를 고정한다 — 프로젝트 범위 절에 GitHub 낱말 키를 더하고 `onGitLab`을 빠뜨리면 red다.
 *
 * ⚠️ 제외는 **GitLab 프로젝트 화면에 닿지 않는 키**만이고 이유가 하나씩 붙는다. 말모이 자체 링크·로그인 공급자 문구는 이 절들에 없다.
 */
const SCOPES = ["home", "translations", "sources", "logs", "settings", "repositorySync", "projects", "locales"] as const;

const NOT_ON_GITLAB_SCREENS: Readonly<Record<string, string>> = {
  // 호스트 이름 표 — Host 행이 `platforms[host]`로 고른다(GitLab 프로젝트는 `gitlab`).
  "home.meta.platforms.github": "Host row picks platforms[host]",
  // 설정 GitHub 카드 전용 — GitLab 프로젝트는 `RepositoryCard`의 GitLab 갈래가 그린다(이 키를 읽지 않는다).
  "settings.installed": "GitHub repository card only",
  "settings.account.connect": "GitHub account recovery only",
  "settings.account.reconnect": "GitHub account recovery only",
  "settings.account.disconnectLabel": "GitHub App disconnect on /account only",
  // GitHub 사용자 토큰이 없는 Sync 거부 — GitLab 프로젝트의 Sync는 `gitlab-*` 코드로 거부된다(R-D2 확인).
  "repositorySync.errors.not-connected": "GitHub user-token refusal only",
  // Home 배너의 다른 리포는 건강성 `repo-replaced`에서만 선다 — GitLab 건강성은 숫자 id라 같은 id·다른 경로가 `repo-moved`다(`planGitLabHealth`).
  // ⚠️ `settings.repository.health.repo-replaced`는 면제가 아니다 — 소스 추가 모달이 추가 거부 코드로 읽고 GitLab도 그 코드를 낸다(아래 회귀).
  "home.banner.wrongRepository.body": "repo-replaced is GitHub-only health",
  // 호스트가 섞인 목록의 빈 상태 — 프로젝트가 아직 없어 호스트 문맥이 없다(D3 †: 두 호스트 병기).
  "projects.empty.description": "no project yet — names both hosts",
};

const GITHUB_WORDS = (text: string) => /github|pull request/i.test(text) || /\bPRs?\b/.test(text);

function shown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(shown).join(" ");
  if (isValidElement(value)) return renderToStaticMarkup(value);
  return "";
}

function hits(m: Messages): string[] {
  const out: string[] = [];
  const walk = (value: unknown, path: string) => {
    // 덮기 노드 자체는 원본 자료다 — 덮인 결과가 이미 형제에 들었다.
    if (path.endsWith(".onGitLab")) return;
    if (typeof value === "function") {
      const text = shown((value as (...a: unknown[]) => unknown)(...Array.from({ length: value.length }, () => 2)));
      if (GITHUB_WORDS(text) && !Object.hasOwn(NOT_ON_GITLAB_SCREENS, path)) out.push(`${path}: ${text}`);
      return;
    }
    if (typeof value === "string" || isValidElement(value) || Array.isArray(value)) {
      if (GITHUB_WORDS(shown(value)) && !Object.hasOwn(NOT_ON_GITLAB_SCREENS, path)) out.push(`${path}: ${shown(value)}`);
      return;
    }
    if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  for (const scope of SCOPES) walk(m[scope], scope);
  return out;
}

describe.each([["en", en], ["ko", ko], ["es", es]] as const)("%s", (_lang, m) => {
  it("GitLab으로 덮은 사전의 프로젝트 범위 절에 GitHub 낱말이 0건이다", () => {
    expect(hits(withRepoHost(m, "gitlab"))).toEqual([]);
  });

  it("카나리아 — GitHub 사전에는 GitHub 낱말이 있다(스캐너가 실제로 센다)", () => {
    expect(hits(m).length).toBeGreaterThan(20);
  });
});

it("제외 목록의 키가 en 사전에 실재한다 — 이름이 바뀌면 예외가 조용히 죽는다", () => {
  for (const path of Object.keys(NOT_ON_GITLAB_SCREENS)) {
    const value = path.split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)?.[key], en);
    expect(value, path).toBeDefined();
  }
});

/**
 * **소스 추가 거부 `repo-replaced`** (리뷰 C 🟡1) — `components/sources/add-sources-modal.tsx`가 건강성이 아니라 추가 거부 코드로
 * `settings.repository.health["repo-replaced"]`를 읽는다. GitLab도 그 코드를 낸다(참조 비움 `lib/onboarding-run/add.ts` · 잠금 뒤 연결 교체
 * `lib/surfaces/create.ts`) — 덮기를 지우면 GitLab 프로젝트 화면에 GitHub 문장이 선다.
 */
it.each([["en", en], ["ko", ko], ["es", es]] as const)("%s — GitLab 프로젝트의 소스 추가 repo-replaced 거부 문장에 GitHub이 없다", (_lang, m) => {
  const text = withRepoHost(m, "gitlab").settings.repository.health["repo-replaced"];
  expect(text).not.toMatch(/github/i);
  expect(text).toMatch(/gitlab/i);
});
