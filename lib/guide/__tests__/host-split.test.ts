import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LEGACY_PAGES, SECTION_LEGACY_ANCHORS } from "@/lib/guide/legacy-anchors";

/**
 * **리포 호스트마다 절차가 갈리는 가이드는 페이지가 갈린다** (2026-10-13 사용자 — gitlab-repositories 뒤).
 * 한 페이지에 GitHub 절과 GitLab 절이 섞이면 독자가 자기 호스트 절을 골라 읽어야 하고, 절 사이 문장이 다른 호스트의
 * 화면 이름을 끌어온다. 연결·CI·머지 세 흐름만 나눈다 — 낱말만 다른 페이지(Publish·push·nightly)는 한 페이지가 맞다.
 *
 * 판정: 호스트 전용 페이지는 **링크 문구를 뺀 본문**에 다른 호스트 이름이 없다(다른 호스트 페이지로 보내는 링크는 둔다).
 * 옛 절 id(`#connect-gitlab` 등)는 `SECTION_LEGACY_ANCHORS`가 새 페이지로 보낸다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const LOCALES = ["en", "ko", "es"] as const;

// 2026-10-13 사용자: 프로젝트 만들기를 Set up에서 떼어 호스트별 장(`create/`)으로 — 브랜치 이후 단계는 두 페이지에 중복돼도 된다.
// 같은 날 사용자: 트러블슈팅도 호스트마다 한 페이지 — 오류를 재현한 컷이 호스트마다 다르다.
const GITHUB_ONLY = ["create/github", "create/workflow", "create/allowed-actions", "sync/merging", "reference/troubleshooting-github"] as const;
const GITLAB_ONLY = ["create/gitlab", "create/gitlab-ci", "sync/merging-gitlab", "reference/troubleshooting-gitlab"] as const;
/** Set up 장에 남는 것 — 만들기가 끝난 프로젝트를 다루는 페이지만. */
const SETUP_PAGES = ["setup/members", "setup/sources", "setup/archive"] as const;

const page = (locale: string, slug: string) => readFileSync(join(ROOT, "guide", locale, `${slug}.md`), "utf8");
/** 링크 문구·대상·코드 스팬을 뺀 본문 — 다른 호스트 페이지로 보내는 링크는 허용한다. */
const prose = (source: string) => source.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/`[^`]*`/g, "");

describe("호스트별 가이드 분리", () => {
  it.each(LOCALES)("%s SUMMARY에 호스트 전용 페이지가 모두 있다", (locale) => {
    const summary = readFileSync(join(ROOT, "guide", locale, "SUMMARY.md"), "utf8");
    for (const slug of [...GITHUB_ONLY, ...GITLAB_ONLY]) expect(summary, slug).toContain(`(${slug}.md)`);
  });

  it.each(LOCALES)("%s GitHub 전용 페이지 본문에 GitLab이 없다", (locale) => {
    for (const slug of GITHUB_ONLY) expect(prose(page(locale, slug)), `${locale}/${slug}`).not.toMatch(/gitlab/i);
  });

  it.each(LOCALES)("%s GitLab 전용 페이지 본문에 GitHub이 없다", (locale) => {
    for (const slug of GITLAB_ONLY) expect(prose(page(locale, slug)), `${locale}/${slug}`).not.toMatch(/github/i);
  });

  it.each(LOCALES)("%s SUMMARY는 Create 장과 Set up 장을 가른다", (locale) => {
    const summary = readFileSync(join(ROOT, "guide", locale, "SUMMARY.md"), "utf8");
    const at = (slug: string) => summary.indexOf(`(${slug}.md)`);
    expect(at("create/README"), "create 장 개요").toBeGreaterThan(-1);
    expect(at("setup/README"), "setup 장 개요").toBeGreaterThan(-1);
    for (const slug of [...GITHUB_ONLY, ...GITLAB_ONLY].filter((s) => s.startsWith("create/"))) {
      expect(at(slug), slug).toBeGreaterThan(at("create/README"));
      expect(at(slug), slug).toBeLessThan(at("setup/README"));
    }
    for (const slug of SETUP_PAGES) expect(at(slug), slug).toBeGreaterThan(at("setup/README"));
    for (const gone of ["setup/create-project", "setup/connect-github", "setup/connect-gitlab", "setup/workflow", "setup/allowed-actions", "setup/gitlab-ci", "reference/troubleshooting"]) {
      expect(summary, gone).not.toContain(`(${gone}.md)`);
    }
  });

  it("옛 페이지는 새 페이지로 가고, 옛 절 id는 새 절로 간다", () => {
    expect(LEGACY_PAGES).toMatchObject({
      "setup/create-project": "/docs/create",
      "setup/connect-github": "/docs/create/github",
      "setup/connect-gitlab": "/docs/create/gitlab",
      "setup/workflow": "/docs/create/workflow",
      "setup/allowed-actions": "/docs/create/allowed-actions",
      "setup/gitlab-ci": "/docs/create/gitlab-ci",
      "reference/troubleshooting": "/docs/reference/troubleshooting-github",
    });
    expect(SECTION_LEGACY_ANCHORS["create"]).toMatchObject({
      "connect-github": "/docs/create/github#connect-github",
      "connect-gitlab": "/docs/create/gitlab#connect-gitlab",
    });
    expect(SECTION_LEGACY_ANCHORS["create/workflow"]).toMatchObject({ "gitlab-ci": "/docs/create/gitlab-ci#gitlab-ci" });
    expect(SECTION_LEGACY_ANCHORS["sync/merging"]).toMatchObject({ "merging-gitlab": "/docs/sync/merging-gitlab#merging-gitlab" });
    expect(SECTION_LEGACY_ANCHORS["reference/troubleshooting-github"]).toMatchObject({ "gitlab-access": "/docs/reference/troubleshooting-gitlab#gitlab-access" });
  });
});
