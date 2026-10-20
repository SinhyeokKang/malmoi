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

/**
 * 결정 18 — 비기준 파일에 누락 키를 넣을 때 그 키의 코드 소유 속성 `formatted`를 기준 파일에서 나른다. 렌더가 비기준 쓰기에 기준 파일 원본을
 * `representationSource`로 싣는다 — 값은 DB에서만 온다(arb `@key`와 같은 부류 — 키마다 출처가 하나라 병합이 아니다).
 */
describe("android-strings — 누락 키 삽입이 기준 파일의 formatted를 나른다", () => {
  it("fr 파일에 없는 키를 넣을 때 `formatted=\"false\"`가 따라온다", () => {
    const base = BASE.replace('<string name="logout">Log out</string>', '<string name="logout" formatted="false">%s · %s</string>');
    const fr = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="title">Accueil</string>\n</resources>\n';
    const keys: RenderKey[] = [
      { key: "title", sourceText: "Home", sortIndex: 0, orphaned: false, cells: { en: { value: "Home" }, fr: { value: "Accueil" } } },
      { key: "logout", sourceText: "%s · %s", sortIndex: 1, orphaned: false, cells: { en: { value: "%s · %s" }, fr: { value: "%s – %s" } } },
    ];
    const out = renderLocaleFiles(format, "per-locale", paths, keys, "en", new Map([[BASE_PATH, base], [FR_PATH, fr]]));
    expect(out.find((f) => f.path === FR_PATH)?.content).toBe(fr.replace("</resources>", '    <string name="logout" formatted="false">%s – %s</string>\n</resources>'));
    expect(out.find((f) => f.path === BASE_PATH)?.content).toBe(base);
  });
});

/**
 * audit 2026-10-20 #1 — 비기준 파일에 쓸 자리가 없는 셀(같은 이름 둘 · `translatable="false"` · 리소스 참조). 전달 판정(`planDelivery`)은 per-locale
 * 표면에서 기준 파일만 읽어 이 셀을 전달로 센다. 그래서 렌더가 blocking으로 막아야 실행이 writer-warnings로 끝나고(Git 쓰기 0 · 전달 확인 0) 토큰이 남는다.
 * 진입점(미리보기·`runSync`)부터 잇는 시나리오는 격리 Postgres(`android-strings-publish.integration.ts`)가 든다.
 */
describe("android-strings — 비기준 파일에 쓸 자리가 없는 셀은 렌더 blocking이다", () => {
  it.each([
    ["같은 이름 둘", '    <string name="title">Accueil</string>\n    <string name="title">Maison</string>', "key-shadowed"],
    ["translatable=false", '    <string name="title" translatable="false">Accueil</string>', "write-slot-not-string-literal"],
    ["리소스 참조", '    <string name="title">@string/app_name</string>', "write-slot-not-string-literal"],
  ] as const)("%s — fr title 편집이 blocking이고 fr 파일은 원본 그대로다", (_, slot, code) => {
    const fr = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${slot}\n</resources>\n`;
    const out = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Début" }), "en", new Map([[BASE_PATH, BASE], [FR_PATH, fr]]));
    expect(out.find((f) => f.path === FR_PATH)?.content).toBe(fr);
    expect(blockingErrors(wrapped(out)).map(({ error }) => [error.path, error.code, error.key])).toEqual([[FR_PATH, code, "title"]]);
    expect(withheldCoordinates(wrapped(out))).toEqual({ locales: new Set(), cells: new Set() });
  });
});
