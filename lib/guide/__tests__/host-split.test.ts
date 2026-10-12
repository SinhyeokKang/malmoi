import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SECTION_LEGACY_ANCHORS } from "@/lib/guide/legacy-anchors";

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

const GITHUB_ONLY = ["setup/connect-github", "setup/workflow", "setup/allowed-actions", "sync/merging"] as const;
const GITLAB_ONLY = ["setup/connect-gitlab", "setup/gitlab-ci", "sync/merging-gitlab"] as const;

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

  it("옛 절 id는 새 페이지로 간다", () => {
    expect(SECTION_LEGACY_ANCHORS["setup/create-project"]).toMatchObject({
      "connect-github": "/docs/setup/connect-github#connect-github",
      "connect-gitlab": "/docs/setup/connect-gitlab#connect-gitlab",
    });
    expect(SECTION_LEGACY_ANCHORS["setup/workflow"]).toMatchObject({ "gitlab-ci": "/docs/setup/gitlab-ci#gitlab-ci" });
    expect(SECTION_LEGACY_ANCHORS["sync/merging"]).toMatchObject({ "merging-gitlab": "/docs/sync/merging-gitlab#merging-gitlab" });
  });
});
