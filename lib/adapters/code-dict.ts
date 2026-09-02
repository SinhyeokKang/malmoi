import {
  Project,
  SyntaxKind,
  type Expression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  type StringLiteral,
} from "ts-morph";

import { compareKeys, looksLikeLocale, rankCandidates } from "./shared";
import type {
  Adapter,
  AdapterError,
  AdapterFile,
  DetectedFormat,
  FileProbe,
  LocaleEntry,
  ReadLocale,
  ReadResult,
  WriteInput,
} from "./types";
import { localeFromPath } from "./chrome-locales";

/**
 * 로케일당 파일 하나인 코드 딕셔너리 — `<dir>/{locale}.{ts,tsx,js,mjs}`.
 *
 * 오픈소스 109개에서 코드 딕셔너리를 쓰는 리포 12개가 **전부 이 형태**였다 (ant-design 73로케일·
 * element-plus 67·vuetify 43·payload 40·arco-design-vue 18·quasar 74는 `.js`).
 * `docs/ADAPTER-COVERAGE.md` 판정 ③.
 *
 * ⚠️ **`ts-dict`와 다른 어댑터다.** 같은 ts-morph를 쓰지만 전제가 반대다:
 * - `ts-dict` — 한 파일 안에 로케일 객체가 여러 개(`const ko`, `const en`). bugshot-2의 관례.
 * - `code-dict` — 파일 하나 = 로케일 하나. 생태계의 관례.
 *
 * ⚠️ **`per-locale` + 수술적 치환이다.** 값만 갈아끼운다 — element-plus의 `// to be translated`
 * 같은 줄 끝 주석이 재생성에서 전부 사라진다 (ARCHITECTURE §1.4).
 */

const SEP = ".";
const CODE_FILE = /^(.*\/)([^/]+)\.(tsx?|mjs|js)$/;

function newProject(): Project {
  // 타입 정보가 필요 없다 — 객체 리터럴 형태만 본다.
  return new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
}

/** `as const`·`satisfies X`·괄호를 벗긴다. */
function unwrap(expr: Expression | undefined): Expression | undefined {
  let cur = expr;
  for (let i = 0; i < 4 && cur !== undefined; i += 1) {
    if (cur.isKind(SyntaxKind.AsExpression) || cur.isKind(SyntaxKind.SatisfiesExpression)) {
      cur = cur.getExpression();
      continue;
    }
    if (cur.isKind(SyntaxKind.ParenthesizedExpression)) {
      cur = cur.getExpression();
      continue;
    }
    return cur;
  }
  return cur;
}

/**
 * 모듈의 default export 객체 리터럴.
 *
 * 두 형태를 받는다 (실측 4개 리포가 이 둘로 갈린다):
 * - `export default { … }` — element-plus·vuetify·quasar
 * - `export default <식별자>` → 그 `const`의 초기화식 — ant-design(`const localeValues: Locale = {…}`)
 *
 * **식별자 추적은 한 단계까지다.** 더 따라가면 import된 값·함수 반환까지 손대게 되고, 그건 우리가
 * 값을 바꿔도 파일에 반영되지 않는 자리다.
 */
function defaultExportObject(sf: SourceFile): ObjectLiteralExpression | undefined {
  for (const assignment of sf.getExportAssignments()) {
    if (assignment.isExportEquals()) continue;
    const expr = unwrap(assignment.getExpression());
    if (expr === undefined) continue;
    if (expr.isKind(SyntaxKind.ObjectLiteralExpression)) return expr;
    if (expr.isKind(SyntaxKind.Identifier)) {
      const decl = sf.getVariableDeclaration(expr.getText());
      const init = unwrap(decl?.getInitializer());
      if (init?.isKind(SyntaxKind.ObjectLiteralExpression)) return init;
    }
  }
  return undefined;
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  /** `dir\0ext` → 로케일 집합 */
  const byDir = new Map<string, Set<string>>();
  for (const path of paths) {
    const m = CODE_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", base = "", ext = "ts"] = m;
    if (!looksLikeLocale(base)) continue;
    const key = `${dir} ${ext}`;
    const set = byDir.get(key) ?? new Set();
    set.add(base);
    byDir.set(key, set);
  }

  // 경로만으로는 판단할 수 없다 — 로케일 이름 소스 파일은 어디에나 있다. **내용을 봐야 한다.**
  if (!probe) return [];

  const candidates = rankCandidates(
    [...byDir.entries()]
      .filter(([, s]) => s.size >= 2)
      .map(([key, locales]) => ({ dir: key.split(" ")[0] ?? "", ext: key.split(" ")[1] ?? "ts", locales })),
  );

  const found: DetectedFormat[] = [];
  for (const { dir, ext, locales } of candidates) {
    const pathTemplate = `${dir}{locale}.${ext}`;
    if (!hasDictionary(pathTemplate, locales, probe)) continue;
    found.push({ adapter: "code-dict", pathTemplate, locales: [...locales] });
  }
  return found;
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

/** 샘플 몇 개에 default export 객체가 실제로 있는지 본다 (`shared.sampleOrder`와 같은 취지). */
function hasDictionary(pathTemplate: string, locales: ReadonlySet<string>, probe: FileProbe): boolean {
  const rest = [...locales].filter((l) => l !== "en").sort(compareKeys);
  const ordered = (locales.has("en") ? ["en", ...rest] : rest).slice(0, 3);
  for (const locale of ordered) {
    const content = probe(pathTemplate.replace("{locale}", locale));
    if (content === undefined) continue;
    try {
      const sf = newProject().createSourceFile(pathTemplate.replace("{locale}", locale), content, { overwrite: true });
      const obj = defaultExportObject(sf);
      // 프로퍼티가 하나도 없으면 판정 보류다 — 빈 스텁 로케일일 수 있다.
      if (obj !== undefined && obj.getProperties().length > 0) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];

  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;

    let obj: ObjectLiteralExpression | undefined;
    try {
      const project = newProject();
      const sf = project.createSourceFile(file.path, file.content, { overwrite: true });
      // ⚠️ **TypeScript 파서는 던지지 않고 복구한다.** `export default { a: '` 같은 미종료 리터럴도
      // 객체 하나를 만들어내므로, 진단을 보지 않으면 깨진 파일에서 쓰레기 키를 읽는다.
      // 구문 진단만 본다 — 타입 진단은 lib을 로드해야 하고 여기선 의미가 없다.
      const syntax = project.getProgram().getSyntacticDiagnostics(sf);
      if (syntax.length > 0) {
        errors.push({ path: file.path, message: `구문 오류: ${syntax[0]?.getMessageText()?.toString() ?? "알 수 없음"}` });
        continue;
      }
      obj = defaultExportObject(sf);
    } catch (cause) {
      errors.push({ path: file.path, message: `파싱 실패: ${(cause as Error).message}` });
      continue;
    }
    if (obj === undefined) {
      errors.push({ path: file.path, message: "default export 객체 리터럴을 찾을 수 없다" });
      continue;
    }

    const entries: LocaleEntry[] = [];
    collect(obj, "", entries, errors, file.path);
    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }

  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  // 이 포맷은 중첩 객체이지만 write가 수술적이라 이 값이 분기에 쓰이지 않는다.
  return { locales, errors, nested: true };
}

/**
 * 문자열 리터럴 리프를 모은다.
 *
 * **문자열 리터럴이 아닌 프로퍼티는 에러로 남긴다** — ant-design의 `Pagination`(import 참조
 * shorthand), `default: typeTemplate`(식별자), 템플릿 리터럴이 그렇다. 조용히 건너뛰면 부분 읽기가
 * `orphaned` 오인으로 번진다 (`docs/ADAPTER-COVERAGE.md` §3 계열).
 */
function collect(
  obj: ObjectLiteralExpression,
  prefix: string,
  out: LocaleEntry[],
  errors: AdapterError[],
  path: string,
): void {
  for (const prop of obj.getProperties()) {
    if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      errors.push({ path, message: `'${prop.getName()}'이 shorthand라 값을 읽을 수 없다 (import 참조로 보인다)` });
      continue;
    }
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
      errors.push({ path, message: `'${prop.getText().slice(0, 40)}'은 프로퍼티 대입이 아니다` });
      continue;
    }
    const nameNode = prop.getNameNode();
    const name = nameNode.isKind(SyntaxKind.StringLiteral) ? nameNode.getLiteralValue() : nameNode.getText();
    const key = prefix === "" ? name : `${prefix}${SEP}${name}`;
    const init = unwrap(prop.getInitializer());
    if (init?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      collect(init, key, out, errors, path);
      continue;
    }
    if (init?.isKind(SyntaxKind.StringLiteral)) {
      out.push({ key, message: init.getLiteralValue() });
      continue;
    }
    errors.push({ path, message: `'${key}'의 값이 문자열 리터럴이 아니다 (${init?.getKindName() ?? "없음"})` });
  }
}

/** 프로퍼티 이름이 식별자로 쓸 수 있는가. 아니면 따옴표로 감싼다. */
const PLAIN_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function write(format: DetectedFormat, input: WriteInput): string | null {
  const file = format.currentFiles?.[0];
  if (!file) return null;

  let sf: SourceFile;
  let root: ObjectLiteralExpression | undefined;
  try {
    sf = newProject().createSourceFile(file.path, file.content, { overwrite: true });
    root = defaultExportObject(sf);
  } catch {
    return file.content;
  }
  if (root === undefined) return file.content;

  const wanted = new Map<string, string>();
  for (const e of input.entries) {
    // orphaned·빈 값은 원본 값을 남긴다 (ARCHITECTURE §1.4).
    if (e.orphaned === true || e.message === "") continue;
    wanted.set(e.key, e.message);
  }

  let changed = false;
  const missing: string[] = [];
  for (const [key, value] of wanted) {
    const target = findScalar(root, key.split(SEP));
    if (target === undefined) {
      missing.push(key);
      continue;
    }
    if (target === "not-a-literal") continue;
    if (target.getLiteralValue() === value) continue;
    // ⚠️ `setLiteralValue`는 이스케이프하지 않는다 — 백슬래시·개행·따옴표가 재파싱에서 깨진다.
    // `JSON.stringify`가 따옴표까지 포함한 유효한 리터럴을 만들고 비ASCII는 그대로 남는다.
    target.replaceWithText(JSON.stringify(value));
    changed = true;
  }

  // 없는 키는 삽입한다 — **정렬 순서로 넣어야 결정적이다** (ARCHITECTURE §1.4).
  for (const key of missing.sort(compareKeys)) {
    const value = wanted.get(key);
    if (value === undefined) continue;
    if (insert(root, key.split(SEP), value)) changed = true;
  }

  return changed ? sf.getFullText() : file.content;
}

/** 경로의 문자열 리터럴 노드. 없으면 `undefined`, 문자열이 아닌 자리면 `"not-a-literal"`. */
function findScalar(
  obj: ObjectLiteralExpression,
  segments: readonly string[],
): StringLiteral | "not-a-literal" | undefined {
  let cur: ObjectLiteralExpression = obj;
  for (let i = 0; i < segments.length; i += 1) {
    const name = segments[i]!;
    const prop = propertyNamed(cur, name);
    if (prop === undefined) return undefined;
    const init = unwrap(prop.getInitializer());
    const last = i === segments.length - 1;
    if (last) {
      if (init?.isKind(SyntaxKind.StringLiteral)) return init;
      return "not-a-literal";
    }
    if (!init?.isKind(SyntaxKind.ObjectLiteralExpression)) return "not-a-literal";
    cur = init;
  }
  return undefined;
}

function propertyNamed(obj: ObjectLiteralExpression, name: string): PropertyAssignment | undefined {
  for (const prop of obj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
    const nameNode = prop.getNameNode();
    const got = nameNode.isKind(SyntaxKind.StringLiteral) ? nameNode.getLiteralValue() : nameNode.getText();
    if (got === name) return prop;
  }
  return undefined;
}

/** 경로를 만들어가며 값을 넣는다. 문자열 자리를 객체로 덮어야 하면 포기한다(구조 변경이다). */
function insert(obj: ObjectLiteralExpression, segments: readonly string[], value: string): boolean {
  let cur: ObjectLiteralExpression = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const name = segments[i]!;
    const prop = propertyNamed(cur, name);
    if (prop === undefined) {
      const added = cur.addPropertyAssignment({ name: quoteName(name), initializer: "{}" });
      const init = unwrap(added.getInitializer());
      if (!init?.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
      cur = init;
      continue;
    }
    const init = unwrap(prop.getInitializer());
    if (!init?.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
    cur = init;
  }
  const leaf = segments[segments.length - 1];
  if (leaf === undefined) return false;
  cur.addPropertyAssignment({ name: quoteName(leaf), initializer: JSON.stringify(value) });
  return true;
}

const quoteName = (name: string) => (PLAIN_NAME.test(name) ? name : JSON.stringify(name));

export const codeDict: Adapter = {
  name: "code-dict",
  layout: "per-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
};
