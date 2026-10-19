import { describe, expect, it } from "vitest";

import type { DetectedFormat } from "@/lib/adapters/types";

import { planConfirmedFormat, templatePaths } from "../confirm";
import { ingestTargets, probeTargets } from "../detect";
import { signSampleConfirmation, verifySampleConfirmation } from "../sample-confirmation";

/**
 * 온보딩·Sync 재탐지가 내려받을 파일 (mobile-strings design §2). 기준 언어 파일이 템플릿 밖(`values/strings.xml`)에 있으면 내려받지 않아
 * 재탐지가 `base-locale-missing`이 된다 — 그래서 basePath를 내려받을 목록에 더한다.
 */
const ANDROID_TEMPLATE = "res/values-{locale}/strings.json";
const ANDROID_BASE = "res/values/strings.json";

describe("templatePaths — basePath도 가리킨다", () => {
  const paths = [ANDROID_BASE, "res/values-ko/strings.json", "res/values-fr/strings.json", "README.md"];

  it("트리에 있으면 basePath를 더한다", () => {
    expect(templatePaths("json-catalog", ANDROID_TEMPLATE, paths, ANDROID_BASE)).toEqual([
      "res/values-fr/strings.json", "res/values-ko/strings.json", ANDROID_BASE,
    ]);
  });

  it("트리에 없으면 더하지 않는다 — 트리가 방어를 겸한다(POSTMORTEM 2026-09-09)", () => {
    expect(templatePaths("json-catalog", ANDROID_TEMPLATE, paths.filter((p) => p !== ANDROID_BASE), ANDROID_BASE)).not.toContain(ANDROID_BASE);
  });

  it("null이면 지금과 같다", () => {
    expect(templatePaths("json-catalog", ANDROID_TEMPLATE, paths, null)).toEqual(["res/values-fr/strings.json", "res/values-ko/strings.json"]);
  });

  it("모르는 어댑터는 basePath가 있어도 아무것도 가리키지 않는다", () => {
    expect(templatePaths("po-gettext" as never, ANDROID_TEMPLATE, paths, ANDROID_BASE)).toEqual([]);
  });
});

describe("probeTargets — 후보의 basePath를 표본으로 내려받는다", () => {
  it("치환 표본에 basePath를 더한다", () => {
    const groups = [{ pathTemplate: ANDROID_TEMPLATE, basePath: ANDROID_BASE, locales: ["ko"] }];
    expect(probeTargets(groups, [], [])).toEqual(["res/values-ko/strings.json", ANDROID_BASE]);
  });

  it("basePath 없는 후보는 지금과 같다", () => {
    expect(probeTargets([{ pathTemplate: ANDROID_TEMPLATE, locales: ["ko"] }], [], [])).toEqual(["res/values-ko/strings.json"]);
  });
});

describe("ingestTargets — 첫 적재가 기준 언어 파일을 basePath에서 받는다", () => {
  const format: DetectedFormat = { adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, basePath: ANDROID_BASE, locales: ["en", "ko"] };
  const paths = [ANDROID_BASE, "res/values-ko/strings.json", "res/values-en/strings.json"];

  it("기준 언어는 basePath에서, values-en/은 받지 않는다", () => {
    expect(ingestTargets(format, "per-locale", paths, "en")).toEqual([ANDROID_BASE, "res/values-ko/strings.json"]);
  });
});

describe("planConfirmedFormat — 고른 basePath와 재탐지의 basePath를 견준다", () => {
  const files = [
    { path: "i18n/en.json", content: '{"a":"A"}' },
    { path: "i18n/ko.json", content: '{"a":"가"}' },
  ];

  it("둘 다 없으면 지금과 같다", () => {
    expect(planConfirmedFormat({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", basePath: null }, files).status).toBe("ok");
  });

  it("고른 값에만 basePath가 있으면 template-mismatch다 — 재탐지가 보지 않은 경로를 저장하지 않는다", () => {
    expect(planConfirmedFormat({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", basePath: "i18n/base.json" }, files))
      .toEqual({ status: "rejected", reason: "template-mismatch" });
  });
});

describe("샘플 확인값 — basePath와 기준 언어를 서명한다", () => {
  const context = { userId: "u1", repositoryId: "123", connection: "github:77", ref: "main", headSha: "abc" };
  const issued = new Date("2026-09-27T00:00:00Z");

  it("서명한 basePath·baseLocale이 검증 뒤 그대로 돌아온다 — 지연 표본이 기준 언어 파일을 basePath에서 읽는다", () => {
    const format = { adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, locales: ["en", "ko"], basePath: ANDROID_BASE, baseLocale: "en" };
    const token = signSampleConfirmation({ ...context, format }, "secret", issued);
    expect(verifySampleConfirmation(token, context, "secret", issued)).toEqual(format);
  });
});
