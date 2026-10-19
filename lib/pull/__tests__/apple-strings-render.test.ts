import { describe, expect, it } from "vitest";

import { appleStrings } from "@/lib/adapters";
import { renderLocaleFiles, type RenderKey } from "../render";
import { blockingErrors, withheldCoordinates } from "../undeliverable";

/**
 * Apple `.strings`의 렌더 경로 (apple-strings design §2.1). create는 값 있는 키만 쓰므로, 언어 파일을 만든 뒤 **다른 키**를 번역하면 그 파일에
 * 자리가 없다 — 원본이 있으니 create가 아니라 write로 가고, per-locale `write-slot-missing`은 blocking이라 Publish 전체가 거부됐을 것이다. 그래서
 * 비-base 파일에는 누락 키를 삽입한다. base 파일은 키 집합을 원본이 정한다(B3.4) — 원본에 없는 DB 키를 넣지 않는다.
 */
const TEMPLATE = "App/{locale}.lproj/Localizable.strings";
const EN_PATH = "App/en.lproj/Localizable.strings";
const FR_PATH = "App/fr.lproj/Localizable.strings";
const EN = '/* Home title */\n"title" = "Home";\n\n/* Sign-out button */\n"logout" = "Log out";\n';
const format = { adapter: "apple-strings" as const, pathTemplate: TEMPLATE, locales: ["en", "fr"] };
const paths = [{ path: EN_PATH, locale: "en" }, { path: FR_PATH, locale: "fr" }];
const keysWith = (fr: Record<string, string>): RenderKey[] => [
  { key: "title", sourceText: "Home", sortIndex: 0, orphaned: false, cells: { en: { value: "Home" }, ...(fr.title === undefined ? {} : { fr: { value: fr.title } }) } },
  { key: "logout", sourceText: "Log out", sortIndex: 1, orphaned: false, cells: { en: { value: "Log out" }, ...(fr.logout === undefined ? {} : { fr: { value: fr.logout } }) } },
];
const wrapped = (files: ReturnType<typeof renderLocaleFiles>) => [{ surfaceId: "s", surfaceSlug: "app", baseLocale: "en", files }];

describe("apple-strings — 생성 → 다른 키 번역 → 두 번째 Publish", () => {
  it("첫 Publish는 값 있는 키만 담은 새 파일을 만들고, 둘째는 그 파일에 다른 키를 삽입하며 blocking이 없다", () => {
    const add = { locales: new Set(["fr"]), source: EN };
    const first = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil" }), "en", new Map([[EN_PATH, EN]]), add);
    expect(first.find((f) => f.path === EN_PATH)).toMatchObject({ content: EN });
    expect(first.find((f) => f.path === FR_PATH)).toEqual({ path: FR_PATH, locale: "fr", content: '"title" = "Accueil";\n' });
    expect(blockingErrors(wrapped(first))).toEqual([]);

    // 첫 PR이 머지됐다 — fr 파일이 원본이다. ADD 계획은 끝났다(represent 없음).
    const current = new Map([[EN_PATH, EN], [FR_PATH, first.find((f) => f.path === FR_PATH)!.content!]]);
    const second = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil", logout: "Se déconnecter" }), "en", current);
    expect(second.find((f) => f.path === FR_PATH)).toEqual({ path: FR_PATH, locale: "fr", content: '"title" = "Accueil";\n"logout" = "Se déconnecter";\n' });
    expect(blockingErrors(wrapped(second))).toEqual([]);
    expect(withheldCoordinates(wrapped(second))).toEqual({ locales: new Set(), cells: new Set() });

    // 다음 렌더는 고정점이다.
    const merged = new Map([[EN_PATH, EN], [FR_PATH, second.find((f) => f.path === FR_PATH)!.content!]]);
    const third = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil", logout: "Se déconnecter" }), "en", merged);
    expect(third.map((f) => f.content)).toEqual([EN, merged.get(FR_PATH)]);
  });

  it("base 파일에는 원본에 없는 DB 키를 넣지 않는다 — 키 존재는 코드가 정한다", () => {
    const keys: RenderKey[] = [...keysWith({}), { key: "deleted", sourceText: "Gone from code", sortIndex: 2, orphaned: false, cells: { en: { value: "Gone from code" } } }];
    const out = renderLocaleFiles(format, "per-locale", [paths[0]!], keys, "en", new Map([[EN_PATH, EN]]));
    expect(out).toEqual([{ path: EN_PATH, locale: "en", content: EN }]);
  });

  it("직접 만든 언어 파일이 없으면 지금처럼 파일 보류다", () => {
    const out = renderLocaleFiles(format, "per-locale", paths, keysWith({ title: "Accueil" }), "en", new Map([[EN_PATH, EN]]));
    expect(withheldCoordinates(wrapped(out)).locales).toEqual(new Set(["s\0fr"]));
  });

  it("create 출력이 같은 어댑터의 read로 다시 읽힌다", () => {
    const created = appleStrings.create!({ ...format, representationSource: EN }, { locale: "fr", baseLocale: "en", entries: [{ key: "title", message: "Accueil", order: 0 }] }).content!;
    const read = appleStrings.read(format, [{ path: FR_PATH, content: created }]);
    expect(read).toEqual({ locales: [{ locale: "fr", entries: [{ key: "title", message: "Accueil", order: 0 }] }], errors: [], nested: false });
  });
});
