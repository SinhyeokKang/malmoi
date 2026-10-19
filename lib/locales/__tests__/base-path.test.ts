import { describe, expect, it } from "vitest";

import { surfacePaths } from "../change";
import { planLocaleChange, type LocaleChangeInput } from "../change-plan";
import { planLocalePublish, type LocalePublishInput } from "../publish-plan";

/**
 * 언어 변경과 basePath (mobile-strings design §2 "언어 제거"). 삭제 경로는 `localeFilePath(template)`이 정하고 기준 언어는 거부되므로
 * `values/strings.xml`은 구조상 안전하다 — 그 성질을 basePath 도입 뒤에도 고정한다. ⚠️ `values-en/`과 `values/`가 공존하고 기준이 en인 경우가
 * 가장 헷갈리는 자리다: `values-en/strings.xml`은 기준 언어 파일이 아니다.
 */
const TEMPLATE = "res/values-{locale}/strings.json";
const BASE = "res/values/strings.json";
const at = (code: string) => `res/values-${code}/strings.json`;

const change = (request: LocaleChangeInput["request"]): LocaleChangeInput => ({
  request, canManage: true, projectArchived: false, publishUnsettled: false,
  surface: { id: "s1", adapterName: "json-catalog", pathTemplate: TEMPLATE, baseLocale: "en" },
  locales: [{ code: "en", orphaned: false }, { code: "ko", orphaned: false }],
  changes: [], otherSurfaces: [], approval: "valid",
});

describe("REMOVE는 basePath를 지우지 않는다", () => {
  it("기준 언어 제거는 거부된다", () => {
    expect(planLocaleChange(change({ kind: "remove", code: "en" }))).toEqual({ ok: false, error: "base-locale" });
  });

  it("다른 언어 제거는 그 언어의 치환 경로다", () => {
    const verdict = planLocaleChange(change({ kind: "remove", code: "ko" }));
    expect(verdict).toMatchObject({ ok: true, transition: { kind: "request-removal", path: at("ko") } });
  });

  const publish = (over: Partial<LocalePublishInput>): LocalePublishInput => ({
    pathTemplate: TEMPLATE, changes: [], delivered: [], valueCounts: new Map(),
    base: { status: "read", files: new Map([[BASE, "regular"], [at("en"), "regular"], [at("ko"), "regular"]]) },
    // 정규 렌더가 쓰는 경로 — 기준 언어는 basePath다(`resolveLocalePaths`).
    upsertPaths: [BASE],
    foreignPaths: [], ...over,
  });

  it("values-en/과 values/가 공존해도 en REMOVE 행의 삭제는 values-en/뿐이다", () => {
    const plan = planLocalePublish(publish({ changes: [{ localeCode: "en", operation: "REMOVE" }] }));
    expect(plan).toMatchObject({ ok: true, deletes: [{ localeCode: "en", path: at("en") }] });
  });

  it("어느 REMOVE도 basePath를 삭제 목록에 넣지 않는다", () => {
    const plan = planLocalePublish(publish({ changes: [{ localeCode: "ko", operation: "REMOVE" }], upsertPaths: [BASE] }));
    expect(plan.ok && plan.deletes.map((d) => d.path)).toEqual([at("ko")]);
  });
});

describe("surfacePaths — 다른 소스가 쥔 경로에 그 소스의 basePath가 든다", () => {
  it("기준 언어는 basePath, 나머지는 치환이다", () => {
    expect(surfacePaths({ pathTemplate: TEMPLATE, basePath: BASE, baseLocale: "en" }, ["en", "ko"])).toEqual([BASE, at("ko")]);
  });

  it("basePath가 없으면 지금과 같다", () => {
    expect(surfacePaths({ pathTemplate: TEMPLATE, basePath: null, baseLocale: "en" }, ["en", "ko"])).toEqual([at("en"), at("ko")]);
  });

  it("템플릿이 없으면 빈 목록, {locale}이 없으면 템플릿 자체다 — 기존 갈래 그대로", () => {
    expect(surfacePaths({ pathTemplate: null, basePath: null, baseLocale: "en" }, ["en"])).toEqual([]);
    expect(surfacePaths({ pathTemplate: "src/i18n/*.ts", basePath: null, baseLocale: "en" }, ["en", "ko"])).toEqual(["src/i18n/*.ts"]);
  });
});
