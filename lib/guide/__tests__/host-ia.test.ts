import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGACY_PAGES, SECTION_LEGACY_ANCHORS } from "../legacy-anchors";
import { OVERVIEW_TRACKS } from "../overview";
import { parseMd } from "../parse";
import { parseSummary } from "../summary";

const moves = {
  "create/github": "github/create",
  "create/workflow": "github/workflow",
  "create/allowed-actions": "github/allowed-actions",
  "sync/merging": "github/merging",
  "reference/troubleshooting-github": "github/troubleshooting",
  "create/gitlab": "gitlab/create",
  "create/gitlab-ci": "gitlab/ci",
  "sync/merging-gitlab": "gitlab/merging",
  "reference/troubleshooting-gitlab": "gitlab/troubleshooting",
};

describe("host chapters", () => {
  it.each(["en", "ko", "es"])("%s keeps each host journey together, including maintenance and troubleshooting", (locale) => {
    const nav = parseSummary(parseMd(readFileSync(`guide/${locale}/SUMMARY.md`, "utf8")));
    for (const host of ["github", "gitlab"]) {
      const chapter = nav.find((node) => node.slug.join("/") === host);
      expect(chapter, host).toBeDefined();
      expect(chapter!.children.map((node) => node.slug.join("/"))).toEqual(host === "github"
        ? ["github/create", "github/workflow", "github/allowed-actions", "github/merging", "github/connection", "github/troubleshooting"]
        : ["gitlab/create", "gitlab/ci", "gitlab/merging", "gitlab/connection", "gitlab/troubleshooting"]);
    }
  });

  it("developers choose a host before following setup steps", () => {
    expect(OVERVIEW_TRACKS.find((track) => track.audience === "forDevelopers")?.pages).toEqual(["github", "gitlab"]);
  });

  it("preserves every moved page URL without redirect chains", () => {
    for (const [old, target] of Object.entries(moves)) expect(LEGACY_PAGES[old], old).toBe(`/docs/${target}`);
  });

  it("old account links land directly on the host connection instructions", () => {
    expect(SECTION_LEGACY_ANCHORS["account/profile"]).toEqual({
      "github-connection": "/docs/github/connection#github-connection",
      "gitlab-token": "/docs/gitlab/connection#gitlab-token",
    });
  });
});
