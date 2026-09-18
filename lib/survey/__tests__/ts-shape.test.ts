import { expect, it } from "vitest";
import { tsShape } from "../ts-shape";

/**
 * **에러 없이 건너뛴 프로퍼티** (launch-readiness L4.8 — 직접 테스트가 없었다). ts-dict는 `PropertyAssignment`가 아니면
 * 조용히 건너뛰고, 그 키는 다음 push에서 orphan된다 — 이 지표가 그 무증상 경로의 유일한 그물이다.
 */
const file = (path: string, content: string) => ({ path, content });

it("로케일 객체 안의 spread·shorthand·메서드·computed key를 센다", () => {
  const s = tsShape([file("src/i18n/a.ts", [
    "const shared = { x: 'X' };",
    "const k = 'dyn';",
    "const ok = 'OK';",
    "const en = { ...shared, ok, hello() { return 'hi'; }, [k]: 'D', plain: 'P' } as const;",
    "export const a = { en };",
  ].join("\n"))]);
  expect(s).toMatchObject({ silentSkips: 3, localeObjectCount: 1, parseFailures: 0 });
});

it("export된 객체·로케일 이름이 아닌 객체는 로케일 객체가 아니다", () => {
  const s = tsShape([file("src/i18n/a.ts", [
    "export const en = { ...x };",
    "const settings = { ...y };",
  ].join("\n"))]);
  expect(s).toMatchObject({ silentSkips: 0, localeObjectCount: 0 });
});

it("as const · satisfies로 감싼 객체도 로케일 객체다", () => {
  const s = tsShape([file("src/i18n/a.ts", "const ko = { ...a } as const;\nconst en = { ...b } satisfies Bundle;\n")]);
  expect(s).toMatchObject({ silentSkips: 2, localeObjectCount: 2 });
});

it("문자열 리터럴을 세고 .ts·.tsx가 아닌 파일은 건너뛴다", () => {
  const s = tsShape([
    file("src/i18n/a.ts", "const en = { a: 'A', b: 'B' };\n"),
    file("src/i18n/b.json", '{ "a": "A" }'),
  ]);
  expect(s).toEqual({ silentSkips: 0, literalCount: 2, localeObjectCount: 1, parseFailures: 0 });
});
