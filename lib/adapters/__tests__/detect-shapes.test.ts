import { describe, expect, it } from "vitest";

import { detectCandidatesAcross } from "../index";
import { jsonCatalog } from "../json-catalog";
import { yamlCatalog } from "../yaml-catalog";
import { hasStrongLocale, strongLocale } from "../shared";
import type { FileProbe } from "../types";

/**
 * 홀드아웃 20개(2026-09-02 3차)가 드러낸 경로 모양 셋. 1·2차 코퍼스 109개에는 표본이 없어
 * 어댑터가 통째로 못 보던 형태다 — 그래서 이 파일이 **실측에서 온 회귀 테스트**다.
 *
 *   ① 약한 로케일 오탐 — `add.json`·`arg.json`처럼 3글자 영단어가 로케일로 잡혔다.
 *   ② 로케일 디렉터리 + 이름 있는 파일 — `{dir}/{locale}/translation.json` (6/20)
 *   ③ 접두사 붙은 파일명 — `{dir}/client.{locale}.yml` (3/20)
 */

const catalog = (keys: readonly string[]): string =>
  `${JSON.stringify(Object.fromEntries(keys.map((k) => [k, `v-${k}`])), null, 2)}\n`;

const probeOf = (files: Record<string, string>): FileProbe => (path) => files[path];

describe("strongLocale — 약한 로케일 코드는 앵커를 요구한다", () => {
  it("2글자·지역 서브태그·camelCase는 강하다", () => {
    for (const name of ["en", "ko", "zh-CN", "pt_BR", "zh-Hans", "koKR", "fil-PH"]) {
      expect(strongLocale(name), name).toBe(true);
    }
  });

  it("맨 3글자는 약하다 — 영단어와 충돌한다", () => {
    for (const name of ["add", "get", "adx", "arg", "fil", "ceb"]) {
      expect(strongLocale(name), name).toBe(false);
    }
  });

  it("약한 것만 모인 그룹은 로케일 모음이 아니다", () => {
    expect(hasStrongLocale(new Set(["add", "get"]))).toBe(false);
    expect(hasStrongLocale(new Set(["fil", "ceb", "en"]))).toBe(true);
  });
});

describe("① 약한 로케일만 모인 디렉터리는 후보가 아니다", () => {
  it("grafana azuremonitor `dashboards/{adx,arg}.json`을 잡지 않는다", () => {
    const files = {
      "public/app/plugins/datasource/azuremonitor/dashboards/adx.json": catalog(["title"]),
      "public/app/plugins/datasource/azuremonitor/dashboards/arg.json": catalog(["title"]),
    };
    expect(jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))).toEqual([]);
  });

  it("n8n `__schema__/…/{add,get}.json`을 잡지 않는다", () => {
    const files = {
      "packages/nodes-base/nodes/Jira/__schema__/v1.0.0/issueAttachment/add.json": catalog(["id"]),
      "packages/nodes-base/nodes/Jira/__schema__/v1.0.0/issueAttachment/get.json": catalog(["id"]),
    };
    expect(jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))).toEqual([]);
  });

  it("강한 로케일이 하나라도 섞이면 3글자도 함께 인정한다", () => {
    const files = {
      "src/i18n/en.json": catalog(["a"]),
      "src/i18n/fil.json": catalog(["a"]),
      "src/i18n/ceb.json": catalog(["a"]),
    };
    const [top] = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("src/i18n/{locale}.json");
    expect(top?.locales.sort()).toEqual(["ceb", "en", "fil"]);
  });
});

describe("② 로케일 디렉터리 + 이름 있는 파일", () => {
  it("grafana `public/locales/{locale}/grafana.json`", () => {
    const locales = ["en-US", "ko-KR", "de-DE"];
    const files = Object.fromEntries(locales.map((l) => [`public/locales/${l}/grafana.json`, catalog(["nav.home"])]));
    const [top] = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("public/locales/{locale}/grafana.json");
    expect(top?.locales.length).toBe(3);
  });

  it("open-webui `src/lib/i18n/locales/{locale}/translation.json`", () => {
    const files = {
      "src/lib/i18n/locales/en-US/translation.json": catalog(["a"]),
      "src/lib/i18n/locales/ko-KR/translation.json": catalog(["a"]),
    };
    const [top] = detectCandidatesAcross(Object.keys(files), probeOf(files));
    expect(top?.adapter).toBe("json-catalog");
    expect(top?.pathTemplate).toBe("src/lib/i18n/locales/{locale}/translation.json");
  });

  it("한 로케일 디렉터리에 파일이 여럿이면 이름 우선순위로 하나만 낸다 (automa)", () => {
    const names = ["blocks", "common", "newtab", "popup"];
    const files: Record<string, string> = {};
    for (const l of ["en", "ko", "pt-BR"]) for (const n of names) files[`src/locales/${l}/${n}.json`] = catalog([n]);
    const found = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    // 디렉터리당 후보 1개 — `common`이 알파벳 첫 `blocks`를 이긴다.
    expect(found.map((f) => f.pathTemplate)).toEqual(["src/locales/{locale}/common.json"]);
  });

  it("zulip `translations.json`이 `legacy_stream_translations.json`을 이긴다", () => {
    const files: Record<string, string> = {};
    for (const l of ["de", "ko"]) {
      files[`locale/${l}/translations.json`] = catalog(["a"]);
      files[`locale/${l}/legacy_stream_translations.json`] = catalog(["a"]);
    }
    const found = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(found.map((f) => f.pathTemplate)).toEqual(["locale/{locale}/translations.json"]);
  });

  it("크롬 `_locales/{locale}/messages.json`을 중복 후보로 내지 않는다", () => {
    const files = {
      "_locales/en/messages.json": `${JSON.stringify({ a: { message: "x" } }, null, 2)}\n`,
      "_locales/ko/messages.json": `${JSON.stringify({ a: { message: "y" } }, null, 2)}\n`,
    };
    expect(jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))).toEqual([]);
    const [top] = detectCandidatesAcross(Object.keys(files), probeOf(files));
    expect(top?.adapter).toBe("chrome-locales");
  });

  it("로케일 디렉터리 형태도 왕복이 바이트 고정점이다", () => {
    const content = `${JSON.stringify({ nav: { home: "Home" }, title: "T" }, null, 2)}\n`;
    const files = {
      "public/locales/en-US/grafana.json": content,
      "public/locales/ko-KR/grafana.json": content,
    };
    const format = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))[0];
    expect(format).toBeDefined();
    if (!format) return;
    const result = jsonCatalog.read(format, Object.entries(files).map(([path, c]) => ({ path, content: c })));
    expect(result.errors).toEqual([]);
    expect(result.locales.map((l) => l.locale)).toEqual(["en-US", "ko-KR"]);
    const writeFormat = { ...format, nested: result.nested, nestedByPath: result.nestedByPath };
    const written = jsonCatalog.write(writeFormat, { locale: "en-US", isBase: true, entries: result.locales[0]?.entries ?? [] });
    expect(written).toBe(content);
    // "고정점"이라면 2차 write까지 봐야 한다 — 1차 `toBe` 하나는 결정성이지 고정점이 아니다
    // (2026-09-04 audit #24). `key-order-golden.test.ts`가 정본이고 여기는 그 모양의 반복이다.
    const again = jsonCatalog.write(
      { ...writeFormat, currentFiles: [{ path: "public/locales/en-US/grafana.json", content: written! }] },
      { locale: "en-US", isBase: true, entries: result.locales[0]?.entries ?? [] },
    );
    expect(again).toBe(written);
  });

  it("접두사 파일명(`locale_{locale}.json`)도 write 왕복이 바이트 동일이다 — 세 경로 모양 중 유일하게 write가 없었다", () => {
    const content = `${JSON.stringify({ a: "A", b: { c: "C" } }, null, 2)}\n`;
    const files = { "options/locale/locale_de-DE.json": content, "options/locale/locale_ko-KR.json": content };
    const format = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))[0]!;
    const result = jsonCatalog.read(format, Object.entries(files).map(([path, c]) => ({ path, content: c })));
    const written = jsonCatalog.write(
      { ...format, nested: result.nested, nestedByPath: result.nestedByPath, currentFiles: [{ path: "options/locale/locale_de-DE.json", content }] },
      { locale: "de-DE", isBase: true, entries: result.locales[0]?.entries ?? [] },
    );
    expect(written).toBe(content);
  });
});

describe("③ 접두사 붙은 파일명", () => {
  it("discourse `config/locales/client.{locale}.yml`", () => {
    const files: Record<string, string> = {};
    for (const l of ["ar", "bs_BA", "en", "ko"]) files[`config/locales/client.${l}.yml`] = `${l}:\n  a: v\n`;
    const [top] = yamlCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("config/locales/client.{locale}.yml");
    expect(top?.locales.sort()).toEqual(["ar", "bs_BA", "en", "ko"]);
  });

  it("gitea `options/locale/locale_{locale}.json`", () => {
    const files = {
      "options/locale/locale_de-DE.json": catalog(["a"]),
      "options/locale/locale_ko-KR.json": catalog(["a"]),
    };
    const [top] = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("options/locale/locale_{locale}.json");
  });

  it("jitsi `lang/main-{locale}.json`", () => {
    const files = {
      "lang/main-af.json": catalog(["a"]),
      "lang/main-en.json": catalog(["a"]),
      "lang/languages.json": catalog(["af"]),
    };
    const [top] = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("lang/main-{locale}.json");
    expect(top?.locales.sort()).toEqual(["af", "en"]);
  });

  it("맨 로케일 파일이 접두사 그룹보다 로케일이 많으면 이긴다 (mastodon)", () => {
    const files: Record<string, string> = {};
    for (const l of ["en", "ko", "ja", "fr"]) files[`config/locales/${l}.yml`] = `${l}:\n  a: v\n`;
    for (const l of ["en", "ko"]) files[`config/locales/devise.${l}.yml`] = `${l}:\n  a: v\n`;
    const [top] = yamlCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("config/locales/{locale}.yml");
  });

  it("접두사가 없으면 접두사 후보를 만들지 않는다", () => {
    const files = { "config/en.json": catalog(["a"]), "config/ko.json": catalog(["a"]) };
    const found = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(found.map((f) => f.pathTemplate)).toEqual(["config/{locale}.json"]);
  });

  it("접두사 뒤가 로케일이 아니면 잡지 않는다", () => {
    const files = {
      "tsconfig.build.json": catalog(["a"]),
      "tsconfig.node.json": catalog(["a"]),
      "webpack.dev.json": catalog(["a"]),
      "webpack.prod.json": catalog(["a"]),
    };
    expect(jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))).toEqual([]);
  });
});

describe("④ 3차 실측이 새로 만든 오탐 둘", () => {
  const catalogOf = (keys: readonly string[]): string =>
    `${JSON.stringify(Object.fromEntries(keys.map((k) => [k, `v-${k}`])), null, 2)}\n`;

  it("맨 로케일 파일이 접두사 붙은 것을 이긴다 — 로케일 수·깊이가 같을 때 (rubygems.org)", () => {
    const files: Record<string, string> = {};
    for (const l of ["en", "ko", "fr"]) {
      files[`config/locales/${l}.yml`] = `${l}:\n  a: v\n`;
      files[`config/locales/avo.${l}.yml`] = `${l}:\n  a: v\n`;
    }
    const found = yamlCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(found[0]?.pathTemplate).toBe("config/locales/{locale}.yml");
    expect(found[1]?.pathTemplate).toBe("config/locales/avo.{locale}.yml");
  });

  it("로케일 디렉터리 형태는 경로에 i18n 신호를 요구한다 (n8n `packages/@n8n/{ai}/package.json`)", () => {
    const files = {
      "packages/@n8n/ai/package.json": catalogOf(["name"]),
      "packages/@n8n/di/package.json": catalogOf(["name"]),
      "packages/@n8n/db/package.json": catalogOf(["name"]),
    };
    expect(jsonCatalog.detectCandidates(Object.keys(files), probeOf(files))).toEqual([]);
  });

  it("경로 모양 순위는 로케일 수보다 **뒤**다 — 1키 49로케일이 진짜를 이기면 안 된다", () => {
    const files: Record<string, string> = {};
    for (const l of ["ar", "en", "ko"]) files[`themes/foundation/locales/${l}.yml`] = `${l}:\n  a: v\n`;
    for (const l of ["ar", "en", "ko", "ja"]) files[`config/locales/client.${l}.yml`] = `${l}:\n  a: v\n`;
    const [top] = yamlCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("config/locales/client.{locale}.yml");
  });
});

describe("⑤ 조상 디렉터리 승격", () => {
  it("`config/locales/{locale}.yml`이 `config/locales/contact_us/contact_us.{locale}.yml`을 이긴다", () => {
    const files: Record<string, string> = {};
    // 자손 쪽이 로케일이 더 많다 — roadmap 실측 그대로(17 vs 15). 수 신호로는 안 뒤집힌다.
    for (const l of ["ar", "en", "fr", "ko", "ja"]) files[`config/locales/contact_us/contact_us.${l}.yml`] = `${l}:\n  a: v\n`;
    for (const l of ["en", "fr", "ko"]) files[`config/locales/${l}.yml`] = `${l}:\n  a: v\n`;
    const found = yamlCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(found[0]?.pathTemplate).toBe("config/locales/{locale}.yml");
  });

  it("⚠️ 어댑터 간 재정렬을 지나서도 살아 있어야 한다 — 어댑터 안에만 두면 무효다", () => {
    const files: Record<string, string> = {};
    for (const l of ["ar", "en", "fr", "ko", "ja"]) files[`config/locales/contact_us/contact_us.${l}.yml`] = `${l}:\n  a: v\n`;
    for (const l of ["en", "fr", "ko"]) files[`config/locales/${l}.yml`] = `${l}:\n  a: v\n`;
    // `detectCandidatesAcross`가 어댑터가 매긴 순서를 버리고 다시 정렬한다.
    const [top] = detectCandidatesAcross(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("config/locales/{locale}.yml");
  });

  it("조상 관계가 아니면 끌어올리지 않는다 (musicblocks `lib/voices`)", () => {
    const files: Record<string, string> = {};
    for (const l of ["en", "ko"]) {
      files[`locales/${l}.json`] = catalog(["a", "b", "c"]);
      files[`lib/voices/${l}.json`] = catalog(["a"]);
    }
    const [top] = jsonCatalog.detectCandidates(Object.keys(files), probeOf(files));
    expect(top?.pathTemplate).toBe("locales/{locale}.json");
  });
});
