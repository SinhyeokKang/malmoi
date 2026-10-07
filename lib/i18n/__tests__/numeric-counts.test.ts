import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { es } from "@/messages/es";

const counts: Readonly<Record<string, (m: Messages) => string>> = {
  "surfaces.sourceCounts": m => m.surfaces.sourceCounts(10000, 10000),
  "sources.count": m => m.sources.count(10000),
  "sources.languageCount": m => m.sources.languageCount(10000),
  "repositorySync.unreadable": m => m.repositorySync.unreadable(10000),
  "repositorySync.notReplaced": m => m.repositorySync.notReplaced(10000),
  "home.cards.acrossSurfaces": m => m.home.cards.acrossSurfaces(10000),
  "home.cards.localeCount": m => m.home.cards.localeCount("fr", 10000),
  "home.attention.more": m => m.home.attention.more(10000),
  "home.meta.memberCount": m => m.home.meta.memberCount(10000, 10000),
  "projects.count": m => m.projects.count(10000),
  "projects.banner.repoAhead": m => m.projects.banner.repoAhead(10000, "main"),
  "account.profile.errors.tooLong": m => m.account.profile.errors.tooLong(10000),
  "newProject.modal.step": m => m.newProject.modal.step(10000),
  "newProject.steps.files.description": m => m.newProject.steps.files.description(10000, "o/r", "main"),
  "newProject.files.summaryShort": m => m.newProject.files.summaryShort(10000, "X"),
  "newProject.naming.slugTooLong": m => m.newProject.naming.slugTooLong(10000),
  "translations.keys": m => m.translations.keys(10000),
  "translations.workspace.detail.languages": m => m.translations.workspace.detail.languages(10000, 10000),
  "translations.workspace.detail.referenced": m => m.translations.workspace.detail.referenced(10000),
  "translations.workspace.footer.unsaved": m => m.translations.workspace.footer.unsaved(10000),
  "translations.publish.unsentCount": m => m.translations.publish.unsentCount(10000),
  "members.seats": m => m.members.seats(10000, 10000),
  "members.seatsFull": m => m.members.seatsFull(10000),
  "members.count": m => m.members.count(10000),
  "members.invite.seatsUsed": m => m.members.invite.seatsUsed(10000, 10000),
  "link.methods.count": m => m.link.methods.count(10000, 10000),
  "errors.access.owner-limit-reached": m => m.errors.access["owner-limit-reached"](10000),
  "errors.invite.limit-reached": m => m.errors.invite["limit-reached"](10000),
  "errors.onboarding.limit-reached": m => m.errors.onboarding["limit-reached"](10000),
  "errors.onboarding.invalid-slug": m => m.errors.onboarding["invalid-slug"](10000),
};

describe.each([["en", en, "10,000"], ["ko", ko, "10,000"], ["es", es, "10.000"]] as const)("사전의 수량 %s", (_uiLocale, m, expected) => {
  it.each(Object.entries(counts))("%s — 문장·낭독 라벨에도 화면 언어의 구분자를 쓴다", (_path, text) => {
    const output = text(m);
    expect(output).toContain(expected);
    expect(output).not.toContain("10000");
  });

  it("PR 번호는 구분자 없는 기술 식별자다", () => {
    expect(m.home.meta.pr(10000)).toBe("#10000");
    expect(m.translations.publish.replacePr(10000)).toContain("#10000");
  });
});
