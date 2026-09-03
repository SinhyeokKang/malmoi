import { describe, expect, it } from "vitest";
import { scanSources, type ScanResult, type SourceFileInput, type WrapperId } from "../index";

/**
 * 훅 기반 i18n의 실측 형태를 고정한다. 픽스처는 추정이 아니라 실제 리포에서 뜬 줄이다 —
 * skillflo(`const { t } = useI18n()`), bugshot-web(next-intl의 `useTranslations`/`getTranslations`).
 */
const I18N_HOOK: WrapperId = { module: "@/i18n", export: "useI18n", kind: "hook" };
const NEXT_INTL: WrapperId = { module: "next-intl", export: "useTranslations", kind: "hook" };
const NEXT_INTL_SERVER: WrapperId = { module: "next-intl/server", export: "getTranslations", kind: "hook" };

const file = (path: string, ...lines: string[]): SourceFileInput => ({
  path,
  code: lines.join("\n"),
  kind: "ts",
});

const scan = (files: SourceFileInput[], wrappers: readonly WrapperId[]): ScanResult =>
  scanSources(files, wrappers);

const clean = (files: SourceFileInput[], wrappers: readonly WrapperId[]) => {
  const r = scan(files, wrappers);
  expect(r.warnings.map((w) => `${w.path}:${w.line} ${w.message}`)).toEqual([]);
  return r.refs;
};

const keysOf = (refs: ReadonlyArray<{ key: string }>) => refs.map((r) => r.key);

describe("훅 — 구조분해로 받는 형태 (skillflo)", () => {
  it("const { t } = useI18n()의 t() 호출을 잡는다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useI18n } from "@/i18n";',
        "function C() {",
        "  const { t } = useI18n();",
        '  return t("gnb.home");',
        "}")],
      [I18N_HOOK],
    );
    expect(refs).toEqual([{ key: "gnb.home", refs: [{ path: "src/a.tsx", line: 4 }] }]);
  });

  it("훅을 import하지 않은 파일의 같은 형태는 무시한다 — 남의 훅이다", () => {
    const r = scan(
      [file("src/o.tsx", "function C() {", "  const { t } = useI18n();", '  return t("theirs");', "}")],
      [I18N_HOOK],
    );
    expect(r.refs).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("구조분해 별칭을 따라간다 — const { t: tr }", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useI18n } from "@/i18n";',
        "const { t: tr } = useI18n();",
        'tr("aliased.key");')],
      [I18N_HOOK],
    );
    expect(keysOf(refs)).toEqual(["aliased.key"]);
  });

  it("훅 import의 별칭도 따라간다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useI18n as useL } from "@/i18n";',
        "const { t } = useL();",
        't("hook.aliased");')],
      [I18N_HOOK],
    );
    expect(keysOf(refs)).toEqual(["hook.aliased"]);
  });

  it("한 파일의 여러 컴포넌트 스코프에서 각각 잡는다 (실측: 한 파일에 6개)", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useI18n } from "@/i18n";',
        "function A() {",
        "  const { t } = useI18n();",
        '  return t("a.one");',
        "}",
        "function B() {",
        "  const { t } = useI18n();",
        '  return t("b.two");',
        "}")],
      [I18N_HOOK],
    );
    expect(keysOf(refs)).toEqual(["a.one", "b.two"]);
  });

  it("인식할 수 없는 형태로 받으면 경고다 — 조용히 0건이 되지 않는다", () => {
    const r = scan(
      [file("src/a.tsx",
        'import { useI18n } from "@/i18n";',
        "const [t] = useI18n();",
        't("arr.key");')],
      [I18N_HOOK],
    );
    expect(r.refs).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ path: "src/a.tsx", line: 2 });
  });
});

describe("훅 — namespace 상대 키 (next-intl)", () => {
  it("문자열 인자가 namespace다 — useTranslations(\"hero\") + t(\"title\") → hero.title", () => {
    const refs = clean(
      [file("src/Hero.tsx",
        'import { useTranslations } from "next-intl";',
        "export default function Hero() {",
        '  const t = useTranslations("hero");',
        '  return t("title");',
        "}")],
      [NEXT_INTL],
    );
    expect(refs).toEqual([{ key: "hero.title", refs: [{ path: "src/Hero.tsx", line: 4 }] }]);
  });

  it("객체 인자의 namespace 프로퍼티를 읽고 await를 벗긴다 (실측 그대로)", () => {
    const refs = clean(
      [file("src/layout.tsx",
        'import { getTranslations } from "next-intl/server";',
        "export async function generateMetadata({ locale }) {",
        '  const t = await getTranslations({ locale, namespace: "meta" });',
        '  return { title: t("title") };',
        "}")],
      [NEXT_INTL_SERVER],
    );
    expect(keysOf(refs)).toEqual(["meta.title"]);
  });

  it("점이 든 namespace도 그대로 잇는다 — privacy.meta + title", () => {
    const refs = clean(
      [file("src/p.tsx",
        'import { getTranslations } from "next-intl/server";',
        'const t = await getTranslations({ locale, namespace: "privacy.meta" });',
        't("title");')],
      [NEXT_INTL_SERVER],
    );
    expect(keysOf(refs)).toEqual(["privacy.meta.title"]);
  });

  it("인자가 없으면 namespace가 없다 — 키를 그대로 쓴다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        "const t = useTranslations();",
        't("bare.key");')],
      [NEXT_INTL],
    );
    expect(keysOf(refs)).toEqual(["bare.key"]);
  });

  it("객체에 namespace가 없으면 접두사를 붙이지 않는다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { getTranslations } from "next-intl/server";',
        "const t = await getTranslations({ locale });",
        't("bare.key");')],
      [NEXT_INTL_SERVER],
    );
    expect(keysOf(refs)).toEqual(["bare.key"]);
  });

  it("namespace가 리터럴이 아니면 경고하고 그 바인딩의 호출을 버린다 — 틀린 접두사가 0건보다 나쁘다", () => {
    const r = scan(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        "const t = useTranslations(ns);",
        't("title");')],
      [NEXT_INTL],
    );
    expect(r.refs).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ path: "src/a.tsx", line: 2 });
  });

  it("한 파일에 이름이 다른 두 바인딩이면 각자의 namespace를 쓴다 (실측: t와 faqT)", () => {
    const refs = clean(
      [file("src/page.tsx",
        'import { getTranslations } from "next-intl/server";',
        'const t = await getTranslations({ locale, namespace: "meta" });',
        'const faqT = await getTranslations({ locale, namespace: "faq" });',
        't("title");',
        'faqT("q1");')],
      [NEXT_INTL_SERVER],
    );
    expect(keysOf(refs)).toEqual(["faq.q1", "meta.title"]);
  });

  it("같은 이름이 스코프별로 다른 namespace를 가지면 각 스코프의 것을 쓴다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        "function A() {",
        '  const t = useTranslations("hero");',
        '  return t("cta");',
        "}",
        "function B() {",
        '  const t = useTranslations("faq");',
        '  return t("cta");',
        "}")],
      [NEXT_INTL],
    );
    expect(keysOf(refs)).toEqual(["faq.cta", "hero.cta"]);
  });

  it("바인딩 스코프 밖의 같은 이름은 남의 것이다 — props로 받은 t를 잡지 않는다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        "function A() {",
        '  const t = useTranslations("hero");',
        '  return t("a");',
        "}",
        "function B({ t }) {",
        '  return t("b");',
        "}")],
      [NEXT_INTL],
    );
    expect(keysOf(refs)).toEqual(["hero.a"]);
  });

  it("훅 호출 자체는 refs가 아니다 — useTranslations(\"hero\")의 hero를 키로 잡지 않는다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        'const t = useTranslations("hero");')],
      [NEXT_INTL],
    );
    expect(refs).toEqual([]);
  });

  it("동적 키는 namespace가 있어도 경고다", () => {
    const r = scan(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        'const t = useTranslations("hero");',
        "t(`k_${x}`);")],
      [NEXT_INTL],
    );
    expect(r.refs).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it("@l10n-keys는 절대 키다 — namespace 접두사를 붙이지 않는다", () => {
    const refs = clean(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        'const t = useTranslations("hero");',
        "// @l10n-keys hero.pending, hero.running",
        "t(`k_${x}`);")],
      [NEXT_INTL],
    );
    expect(keysOf(refs)).toEqual(["hero.pending", "hero.running"]);
  });
});

describe("래퍼 여러 개 — 한 리포가 두 형태를 함께 쓴다 (실측: bugshot-web)", () => {
  it("next-intl과 next-intl/server를 동시에 지정하면 둘 다 잡는다", () => {
    const refs = clean(
      [
        file("src/Hero.tsx",
          'import { useTranslations } from "next-intl";',
          'const t = useTranslations("hero");',
          't("title");'),
        file("src/Faq.tsx",
          'import { getTranslations } from "next-intl/server";',
          'const t = await getTranslations("faq");',
          't("q1");'),
      ],
      [NEXT_INTL, NEXT_INTL_SERVER],
    );
    expect(keysOf(refs)).toEqual(["faq.q1", "hero.title"]);
  });

  it("direct와 hook을 섞어 쓸 수 있다", () => {
    const refs = clean(
      [
        file("src/a.ts", 'import { t } from "@/i18n";', 't("direct.key");'),
        file("src/b.tsx",
          'import { useTranslations } from "next-intl";',
          'const t = useTranslations("hero");',
          't("title");'),
      ],
      [{ module: "@/i18n", export: "t", kind: "direct" }, NEXT_INTL],
    );
    expect(keysOf(refs)).toEqual(["direct.key", "hero.title"]);
  });

  it("hook으로 선언한 export를 직접 부른 것은 잡지 않는다 — 그건 훅 호출이다", () => {
    const r = scan(
      [file("src/a.tsx",
        'import { useTranslations } from "next-intl";',
        'useTranslations("hero");')],
      [NEXT_INTL],
    );
    expect(r.refs).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
