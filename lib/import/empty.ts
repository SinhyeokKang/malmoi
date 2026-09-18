import { Project, SyntaxKind } from "ts-morph";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { adapterFor } from "@/lib/adapters";
import type { AdapterName, DetectedFormat } from "@/lib/adapters/types";
import { templatePaths } from "@/lib/onboarding/confirm";
import { checkContentBudget } from "@/lib/onboarding/budget";

/** 엔트리가 비었다는 것만으로는 부족하다 — 모든 대상이 base를 포함한, 오류 없이 인식된 카탈로그여야 한다. */
export function verifyEmptyCatalog(input: {
  stored: { adapter: AdapterName; pathTemplate: string; baseLocale: string };
  paths: readonly string[];
  blobs: ReadonlyMap<string, string>;
}): boolean {
  const targets = templatePaths(input.stored.adapter, input.stored.pathTemplate, input.paths);
  if (targets.length === 0) return false;
  const format: DetectedFormat = { adapter: input.stored.adapter, pathTemplate: input.stored.pathTemplate, locales: [] };
  const adapter = adapterFor(format);
  let bytes = 0;
  const locales = new Set<string>();
  for (const path of targets) {
    const content = input.blobs.get(path);
    if (content === undefined) return false;
    bytes = checkContentBudget(path, content, bytes);
    if (input.stored.adapter === "yaml-catalog") {
      const document = parseDocument(content);
      // reader는 알리아스·null·복합 키를 건너뛴다 — 건너뛴 내용은 빈 카탈로그가 아니다.
      if (document.errors.length > 0 || !isMap(document.contents) || !emptyYamlContainer(document.contents)) return false;
    }
    const read = adapter.read(format, [{ path, content }]);
    if (read.errors.length > 0 || read.locales.length === 0 || read.locales.some(locale => locale.entries.length > 0)) return false;
    // JSON null 잎은 미번역 키이지 카탈로그에 키가 없다는 증거가 아니다.
    if (input.stored.adapter === "json-catalog" && !emptyJsonContainer(JSON.parse(content))) return false;
    if (input.stored.adapter === "ts-dict") {
      // ts-dict.read는 축약·spread를 일부러 무시한다. 빈 딕셔너리의 증거가 아니다.
      const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true, compilerOptions: { noLib: true } });
      const source = project.createSourceFile(path, content);
      for (const locale of read.locales) {
        const init = source.getVariableDeclaration(locale.locale)?.getInitializer();
        const object = init?.isKind(SyntaxKind.AsExpression) || init?.isKind(SyntaxKind.SatisfiesExpression) ? init.getExpression() : init;
        if (!object?.isKind(SyntaxKind.ObjectLiteralExpression) || object.getProperties().length !== 0) return false;
      }
    }
    for (const locale of read.locales) locales.add(locale.locale);
  }
  return locales.has(input.stored.baseLocale);
}

function emptyYamlContainer(value: unknown): boolean {
  if (isMap(value)) return value.items.every(pair => isScalar(pair.key) && typeof pair.key.value === "string" && emptyYamlContainer(pair.value));
  if (isSeq(value)) return value.items.every(emptyYamlContainer);
  return false;
}

function emptyJsonContainer(value: unknown): boolean {
  return value !== null && typeof value === "object" && Object.values(value).every(emptyJsonContainer);
}
