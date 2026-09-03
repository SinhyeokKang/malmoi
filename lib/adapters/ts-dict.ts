import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";

import { quoteLiteral, quoteOf } from "./quote-style";
import { compareKeys, looksLikeLocale } from "./shared";
import type { Adapter, AdapterError, AdapterFile, DetectedFormat, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";

/**
 * TypeScript 딕셔너리 — 한 파일에 로케일별 객체 리터럴이 나란히 선언된 형태.
 *
 * ```ts
 * const ko = { "common.ok": "확인", ... } as const;
 * const en = { "common.ok": "OK", ... } satisfies Bundle;
 * export const common = { ko, en, fr };
 * ```
 *
 * bugshot-2의 `src/i18n/namespaces/*.ts` 8파일이 이 형태이고 **903키 × ko/en/fr**이다.
 * 그 리포의 `_locales` 4키는 스토어 메타데이터일 뿐이라 실제 번역 표면은 여기다.
 *
 * ⚠️ **write가 수술적 치환이다** — 문자열 값만 바꾸고 나머지 소스를 보존한다. 재생성하면
 * 사람이 의미 단위로 넣은 빈 줄(120개)과 주석(23개)이 사라진다 (MVP §4.1).
 */

/** 로케일 파일이 모인 디렉터리 패턴. `{locale}`이 경로에 없어 다른 어댑터와 규칙이 다르다. */
const NS_DIR = /^(.*\/)[^/]+\.tsx?$/;

function newProject(): Project {
  // 타입 정보가 필요 없다(객체 리터럴 형태만 본다) — 컴파일러 옵션·lib을 로드하지 않는다.
  return new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
}

/** 파일에서 `const <locale> = { ... }` 객체 리터럴을 로케일별로 찾는다. */
function localeObjects(sourceFile: SourceFile): Map<string, ObjectLiteralExpression> {
  const found = new Map<string, ObjectLiteralExpression>();
  for (const decl of sourceFile.getVariableDeclarations()) {
    const name = decl.getName();
    if (!looksLikeLocale(name)) continue;
    // ⚠️ **export된 선언은 로케일 객체가 아니다.** `export const ai = { ko, en, fr }`처럼
    // 네임스페이스 이름이 2~3자 소문자면 `looksLikeLocale`을 통과한다 — bugshot-2의
    // `ai`·`app`이 실제로 0키 "로케일"로 잡혔다. 묶음 객체는 항상 export되고
    // 로케일 객체는 항상 파일 내부용이라 이 한 줄로 갈린다.
    if (decl.getVariableStatementOrThrow().isExported()) continue;
    const init = decl.getInitializer();
    // `as const`·`satisfies X`로 감싸져 있으면 벗겨낸다.
    const inner = init?.isKind(SyntaxKind.AsExpression) || init?.isKind(SyntaxKind.SatisfiesExpression)
      ? init.getExpression()
      : init;
    if (inner?.isKind(SyntaxKind.ObjectLiteralExpression)) found.set(name, inner);
  }
  return found;
}

/** 객체 리터럴의 `"key": "value"` 쌍. 값이 문자열 리터럴이 아니면 에러로 보고한다. */
function pairs(
  obj: ObjectLiteralExpression,
  path: string,
  errors: AdapterError[],
): Array<{ key: string; value: string; assignment: ReturnType<ObjectLiteralExpression["getProperties"]>[number] }> {
  const out = [];
  for (const prop of obj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
    const nameNode = prop.getNameNode();
    const key = nameNode.isKind(SyntaxKind.StringLiteral) ? nameNode.getLiteralValue() : nameNode.getText();
    const init = prop.getInitializer();
    if (!init?.isKind(SyntaxKind.StringLiteral)) {
      errors.push({ path, message: `'${key}'의 값이 문자열 리터럴이 아니다 (${init?.getKindName() ?? "없음"})` });
      continue;
    }
    out.push({ key, value: init.getLiteralValue(), assignment: prop });
  }
  return out;
}

/**
 * ⚠️ **항상 빈 배열이다 — 자동 탐지에서 빠졌다** (2026-09-02, ADAPTER-COVERAGE 판정 ③).
 *
 * 오픈소스 109개에서 후보에 **0회** 올랐고, 코드 딕셔너리를 쓰는 12개 리포는 **전부 로케일당 파일
 * 하나**(`code-dict`)였다 — "한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가
 * 아니다. 남겨두는 대가가 `.ts` 디렉터리마다 ts-morph를 돌리는 probe 비용뿐이라 뺐다.
 *
 * **`--adapter ts-dict` / `Project.adapterName` 명시 지정은 그대로 동작한다** — bugshot-2가 실전
 * 검증 대상이고, `read`·`write`는 아무것도 바뀌지 않았다.
 *
 * ⚠️ **그래서 `detect`와 `detectCandidates`가 갈린다.** 자동 탐지는 `detectCandidatesAcross`가
 * `detectCandidates`를 부르므로 빈 배열이면 참여하지 않고, 명시 지정은 `detectFormatWith`가
 * `detect`를 부르므로 그쪽은 내용 탐지를 그대로 쓴다. **전에는 `detect`도 빈 배열을 거쳐서
 * `--adapter ts-dict`가 "해당 포맷을 찾지 못했다"로 죽었다** — 위 문장이 코드와 어긋나 있었고,
 * "ADAPTERS에 남아 있다"만 검사하는 테스트가 그걸 가렸다 (2026-09-03).
 */
function detectCandidates(_paths: readonly string[], _probe?: (p: string) => string | undefined): DetectedFormat[] {
  return [];
}

function detectByContent(paths: readonly string[], probe?: (p: string) => string | undefined): DetectedFormat[] {
  const byDir = new Map<string, string[]>();
  for (const path of paths) {
    const m = NS_DIR.exec(path);
    if (!m?.[1]) continue;
    (byDir.get(m[1]) ?? byDir.set(m[1], []).get(m[1])!).push(path);
  }

  // 경로만으로는 판단할 수 없다 — .ts 디렉터리는 어디에나 있다. **내용을 봐야 한다.**
  if (!probe) return [];

  const dirs = [...byDir.entries()].sort(([a], [b]) => compareKeys(a, b));
  const found: DetectedFormat[] = [];
  for (const [dir, files] of dirs) {
    const locales = new Set<string>();
    let matched = 0;
    for (const path of files.slice(0, 4)) {
      const content = probe(path);
      if (content === undefined) continue;
      const sf = newProject().createSourceFile(path, content, { overwrite: true });
      const objs = localeObjects(sf);
      // 로케일 이름 선언이 2개 이상이어야 딕셔너리로 인정한다.
      if (objs.size < 2) continue;
      matched += 1;
      for (const name of objs.keys()) locales.add(name);
    }
    if (matched === 0 || locales.size < 2) continue;
    found.push({ adapter: "ts-dict", pathTemplate: `${dir}*.ts`, locales: [...locales] });
  }
  return found;
}

/**
 * **명시 지정 전용 진입점이다.** `detectCandidates`(자동 탐지)와 달리 내용 탐지를 그대로 쓴다 —
 * `detectFormatWith("ts-dict", …)`가 이걸 부른다.
 */
function detect(paths: readonly string[], probe?: (p: string) => string | undefined): DetectedFormat | undefined {
  return detectByContent(paths, probe)[0];
}

/** 자동 탐지에서 빠진 로직. 되살리려면 `detectCandidates`가 이걸 부르면 된다. */
export const tsDictDetectByContent = detectByContent;

function read(_format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const byLocale = new Map<string, LocaleEntry[]>();
  const errors: AdapterError[] = [];

  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue;
    const sf = newProject().createSourceFile(file.path, file.content, { overwrite: true });
    for (const [locale, obj] of localeObjects(sf)) {
      const list = byLocale.get(locale) ?? [];
      // description을 담을 곳이 없다 — 이 포맷엔 필드가 없다.
      for (const { key, value } of pairs(obj, file.path, errors)) list.push({ key, message: value });
      byLocale.set(locale, list);
    }
  }

  const locales: ReadLocale[] = [...byLocale.entries()]
    .map(([locale, entries]) => ({ locale, entries: entries.sort((a, b) => compareKeys(a.key, b.key)) }))
    .sort((a, b) => compareKeys(a.locale, b.locale));

  // 이 포맷은 정의상 flat 점 표기다.
  return { locales, errors, nested: false };
}

/**
 * **수술적 치환.** 원본 소스를 파싱해 값이 바뀐 문자열 리터럴만 교체하고 나머지는 그대로 둔다.
 *
 * @returns 원본(`format.currentFiles`)이 없으면 `null` — 치환할 대상이 없다.
 *   여러 파일에 걸치므로 **한 파일의 내용**을 돌려주려면 호출부가 파일별로 부른다.
 */
function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

/** `write`와 같되 `pairs`가 건너뛴 비리터럴 프로퍼티를 에러로 돌려준다 — 전에는 모아서 버렸다. */
function writeWithErrors(
  format: DetectedFormat,
  input: WriteInput,
): { content: string | null; errors: AdapterError[] } {
  const current = format.currentFiles;
  if (!current || current.length === 0) return { content: null, errors: [] };
  // 한 번에 한 파일만 다룬다. 여러 파일이 오면 첫 번째 — 호출부가 파일별로 부르는 계약이다.
  const file = current[0];
  if (!file) return { content: null, errors: [] };

  const wanted = new Map<string, string>();
  for (const e of input.entries) {
    // orphaned 키는 파일에 남긴다 — 값을 바꾸지 않는다. 지우면 코드가 참조하는 키가 사라진다.
    // 빈 값도 남긴다 — 호출부(`buildWriteEntries`)가 이미 거르지만, 이 어댑터만 이중 방어가
    // 없으면 소스에 `""`가 박히고 TS 딕셔너리엔 폴백이 없다 (`code-dict`·`yaml-catalog`와 같은 규칙).
    if (e.orphaned === true || e.message === "") continue;
    wanted.set(e.key, e.message);
  }

  const sf = newProject().createSourceFile(file.path, file.content, { overwrite: true });
  const obj = localeObjects(sf).get(input.locale);
  if (!obj) return { content: file.content, errors: [] };

  const errors: AdapterError[] = [];
  let changed = false;
  for (const { key, value, assignment } of pairs(obj, file.path, errors)) {
    const next = wanted.get(key);
    if (next === undefined || next === value) continue;
    const init = assignment.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializerIfKindOrThrow(SyntaxKind.StringLiteral);
    // ⚠️ `setLiteralValue`는 **이스케이프하지 않는다** — 값을 원문 그대로 소스에 써서
    // 백슬래시·개행·따옴표가 재파싱 때 깨진다(실측: `a"b\c\nd`가 `a"bcd`로 읽혔다).
    // `quoteLiteral`이 `JSON.stringify`로 안전한 리터럴을 만들되 **원본의 인용 부호로** 낸다 —
    // 큰따옴표 고정이면 작은따옴표 리포에서 편집한 줄만 스타일이 튄다 (§1.4).
    // 비ASCII는 그대로 두므로 한글이 유니코드 이스케이프로 바뀌지 않는다.
    init.replaceWithText(quoteLiteral(next, quoteOf(init.getText())));
    changed = true;
  }

  // 값이 안 바뀌면 원본을 그대로 돌려준다 — ts-morph의 출력 정규화가 끼어들지 않게 한다.
  return { content: changed ? sf.getFullText() : file.content, errors };
}

export const tsDict: Adapter = {
  name: "ts-dict",
  layout: "multi-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
};
