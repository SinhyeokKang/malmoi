import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **GitLab CI/CD 변수 안내의 화면 라벨** (#258) — GitLab의 Add variable 화면은 **Protect variable** 체크박스와 **Visibility** 라디오(**Masked**)다.
 * "Mask variable" 체크박스는 없다. 라벨은 가이드(`guide/<lang>/setup/workflow.md`)·`guide/AUTHORING.md` 외부 라벨 표와 같은 글자여야 한다.
 */
const text = (value: unknown) => (isValidElement(value) ? renderToStaticMarkup(value) : String(value));
const surfaces = (m: Messages) => ({
  "newProject.result.token.onGitLab.description": text(m.newProject.result.token.onGitLab.description("PUSH_TOKEN")),
  "settings.workflow.gitlabVariable": m.settings.workflow.gitlabVariable,
});

describe.each([["en", en], ["ko", ko], ["es", es]] as const)("%s", (_lang, m) => {
  it.each(Object.entries(surfaces(m)))("%s — Protect variable · Visibility · Masked를 말하고 없는 체크박스(Mask variable)를 말하지 않는다", (_path, value) => {
    expect(value).toContain("Protect variable");
    expect(value).toContain("Visibility");
    expect(value).toContain("Masked");
    expect(value).not.toContain("Mask variable");
  });
});
