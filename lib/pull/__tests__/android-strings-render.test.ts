import { describe, expect, it } from "vitest";

import { androidStrings } from "@/lib/adapters";
import { formatFromProject, resolveLocalePaths } from "../plan";
import { renderLocaleFiles, type RenderKey } from "../render";
import { blockingErrors, withheldCoordinates } from "../undeliverable";

/**
 * Android의 렌더 경로 (android-strings design §2.1·§2.3). 기준 언어 파일은 템플릿 밖 `values/strings.xml`(basePath)이고, 저장된 표면에서
 * 만든 포맷(`formatFromProject`)이 그 파일의 언어를 `templateLocale`로 싣는다 — 실리지 않으면 B3.4(원본이 base 키 집합을 정한다)의 read가
 * 기준 파일을 못 읽어 원본에 없는 DB 키를 기준 파일에 넣는다. 언어 파일을 만든 뒤 다른 키를 번역하면 그 파일에 삽입한다(`write-slot-missing` blocking 회피).
 */
const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
const BASE_PATH = "app/src/main/res/values/strings.xml";
const FR_PATH = "app/src/main/res/values-fr/strings.xml";
const BASE = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<resources>",
  "    <!-- Home -->",
  '    <string name="title">Home</string>',
  '    <string name="logout">Log out</string>',
  "</resources>",
  "",
].join("\n");
const format = formatFromProject({ adapterName: "android-strings", pathTemplate: TEMPLATE, nested: null, nestedByPath: null, baseLocale: "en", basePath: BASE_PATH }, ["en", "fr"]);
const paths = resolveLocalePaths(format, "per-locale", [BASE_PATH], "en");
const keysWith = (fr: Record<string, string>): RenderKey[] => [
  { key: "title", sourceText: "Home", sortIndex: 0, orphaned: false, cells: { en: { value: "Home" }, ...(fr.title === undefined ? {} : { fr: { value: fr.title } }) } },
  { key: "logout", sourceText: "Log out", sortIndex: 1, orphaned: false, cells: { en: { value: "Log out" }, ...(fr.logout === undefined ? {} : { fr: { value: fr.logout } }) } },
];
const wrapped = (files: ReturnType<typeof renderLocaleFiles>) => [{ surfaceId: "s", surfaceSlug: "app", baseLocale: "en", files }];

describe("android-strings — 저장된 표면의 포맷", () => {
  it("formatFromProject가 basePath와 그 파일의 언어(templateLocale)를 싣고, 기준 언어 경로가 basePath다", () => {
    expect(format).toEqual({ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, templateLocale: "en", locales: ["en", "fr"] });
    expect(paths).toEqual([{ locale: "en", path: BASE_PATH }, { locale: "fr", path: FR_PATH }]);
  });

  it("basePath가 없는 표면은 templateLocale을 싣지 않는다 — 기존 포맷 모양 그대로", () => {
    expect(formatFromProject({ adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: null, nestedByPath: null, baseLocale: "en", basePath: null }, ["en"]))
      .toEqual({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en"] });
  });
});

describe("android-strings — 생성 → 다른 키 번역 → 두 번째 Publish", () => {
  it("첫 Publish는 뼈대 + 값 있는 키만 담은 새 파일, 둘째는 다른 키를 삽입하며 blocking이 없고, 셋째는 고정점이다", () => {
    const add = { locales: new Set(["fr"]), source: BASE };
    const first = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil" }), "en", new Map([[BASE_PATH, BASE]]), add);
    expect(first.find((f) => f.path === BASE_PATH)).toMatchObject({ content: BASE });
    const created = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="title">Accueil</string>\n</resources>\n';
    expect(first.find((f) => f.path === FR_PATH)).toEqual({ path: FR_PATH, locale: "fr", content: created });
    expect(blockingErrors(wrapped(first))).toEqual([]);

    const current = new Map([[BASE_PATH, BASE], [FR_PATH, created]]);
    const second = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil", logout: "Se déconnecter" }), "en", current);
    const inserted = created.replace("</resources>", '    <string name="logout">Se déconnecter</string>\n</resources>');
    expect(second.find((f) => f.path === FR_PATH)).toEqual({ path: FR_PATH, locale: "fr", content: inserted });
    expect(blockingErrors(wrapped(second))).toEqual([]);
    expect(withheldCoordinates(wrapped(second))).toEqual({ locales: new Set(), cells: new Set() });

    const merged = new Map([[BASE_PATH, BASE], [FR_PATH, inserted]]);
    const third = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil", logout: "Se déconnecter" }), "en", merged);
    expect(third.map((f) => f.content)).toEqual([BASE, inserted]);
  });

  it("기준 파일(basePath)에는 원본에 없는 DB 키를 넣지 않고, 고친 기준 값은 그 자리에 쓴다", () => {
    const keys: RenderKey[] = [
      { ...keysWith({})[0]!, cells: { en: { value: "Start" } } },
      keysWith({})[1]!,
      { key: "deleted", sourceText: "Gone from code", sortIndex: 2, orphaned: false, cells: { en: { value: "Gone from code" } } },
    ];
    const out = renderLocaleFiles(format, "per-locale", [paths[0]!], keys, "en", new Map([[BASE_PATH, BASE]]));
    expect(out).toEqual([{ path: BASE_PATH, locale: "en", content: BASE.replace(">Home<", ">Start<") }]);
  });

  it("create 출력이 같은 어댑터의 read로 다시 읽힌다", () => {
    const created = androidStrings.create!({ ...format, representationSource: BASE }, { locale: "fr", baseLocale: "en", entries: [{ key: "title", message: "Accueil", order: 0 }] }).content!;
    expect(androidStrings.read(format, [{ path: FR_PATH, content: created }])).toEqual({ locales: [{ locale: "fr", entries: [{ key: "title", message: "Accueil", order: 0 }] }], errors: [], nested: false });
  });
});
