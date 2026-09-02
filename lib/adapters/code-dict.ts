import {
  Project,
  SyntaxKind,
  type Expression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  type StringLiteral,
} from "ts-morph";

import { compareKeys, hasStrongLocale, looksLikeLocale, rankCandidates } from "./shared";
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
    // ⚠️ `export default flat({ … })` 같은 **함수 호출은 잡지 않는다.** 문자열이 이 파일에
    // 없으므로(happy-func/next-official은 import한 JSON을 감싼다) 편집 대상이 아니다.
  }

  // default export가 없으면 **명명된 export const 객체**를 본다 — payloadcms/payload가
  // `export const koTranslations: X = { … }` 형태다. 실측 4회차에서 40로케일 × 여러 패키지가
  // 이것 때문에 통째로 빠졌다.
  const exported: ObjectLiteralExpression[] = [];
  for (const decl of sf.getVariableDeclarations()) {
    if (!decl.getVariableStatementOrThrow().isExported()) continue;
    const init = unwrap(decl.getInitializer());
    if (init?.isKind(SyntaxKind.ObjectLiteralExpression)) exported.push(init);
  }
  if (exported.length === 0) return undefined;
  // 여럿이면 프로퍼티가 많은 쪽. 동수면 소스 순서 — 어느 쪽이든 **결정적이어야** 한다.
  return exported.reduce((a, b) => (b.getProperties().length > a.getProperties().length ? b : a));
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
      // 강한 로케일 코드가 하나도 없으면 로케일 모음이 아니다 — `shared.hasStrongLocale`.
      .filter(([, s]) => s.size >= 2 && hasStrongLocale(s))
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
      // ⚠️ **프로퍼티 유무만 보면 안 된다.** `looksLikeLocale`이 이름만 보므로 도메인 모듈이
      // 로케일로 잡힌다 — home-assistant의 `src/data/{fan,stt,tts}.ts`, violentmonkey의
      // `src/background/utils/*.js`가 그렇게 **키 0개짜리 후보**가 됐다. 문자열 리프가 하나라도
      // 있어야 카탈로그다.
      if (obj !== undefined && hasStringLeaf(obj)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** 객체 안에 문자열 리터럴 값이 하나라도 있는가 (중첩 포함). */
function hasStringLeaf(obj: ObjectLiteralExpression, depth = 0): boolean {
  if (depth > 6) return false;
  for (const prop of obj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
    const init = unwrap(prop.getInitializer());
    if (init?.isKind(SyntaxKind.StringLiteral)) return true;
    if (init?.isKind(SyntaxKind.ObjectLiteralExpression) && hasStringLeaf(init, depth + 1)) return true;
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
    const target = findScalar(root, key);
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
    if (insert(root, key, value)) changed = true;
  }

  return changed ? sf.getFullText() : file.content;
}

/**
 * 키가 가리키는 문자열 리터럴 노드. 없으면 `undefined`, 문자열이 아닌 자리면 `"not-a-literal"`.
 *
 * ⚠️ **리터럴 전체 키를 먼저 본다.** 코드 딕셔너리가 `{ "common.ok": "확인" }`처럼 점을 품은
 * 평평한 키를 쓰는 경우가 흔한데(bugshot-2가 그렇다), 곧바로 `.`으로 쪼개면 그 프로퍼티를 못 찾고
 * **없는 키로 판정해 중첩 객체를 새로 만든다** — 원본 규약을 갈아치우는 셈이다.
 */
function findScalar(obj: ObjectLiteralExpression, key: string): StringLiteral | "not-a-literal" | undefined {
  const direct = propertyNamed(obj, key);
  if (direct !== undefined) {
    const init = unwrap(direct.getInitializer());
    return init?.isKind(SyntaxKind.StringLiteral) ? init : "not-a-literal";
  }

  const segments = key.split(SEP);
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

/**
 * 없는 키를 넣는다. **가장 깊은 기존 접두까지 내려가고, 남은 부분은 리터럴 키 하나로 넣는다.**
 *
 * 이 규칙이 원본의 규약을 보존한다:
 * - 평평한 점 키 파일(`{ "common.ok": … }`) — `common`이 없으므로 루트에 `"common.newKey"`를 넣는다
 * - 중첩 파일(`{ el: { ok: … } }`) — `el`까지 내려가 `newKey`를 넣는다
 *
 * 새 중간 객체를 만들지 않는 이유: 만들면 파일 안에 두 규약이 섞인다.
 */
function insert(obj: ObjectLiteralExpression, key: string, value: string): boolean {
  const segments = key.split(SEP);
  let cur: ObjectLiteralExpression = obj;
  let at = 0;
  while (at < segments.length - 1) {
    const prop = propertyNamed(cur, segments[at]!);
    if (prop === undefined) break;
    const init = unwrap(prop.getInitializer());
    // 문자열 자리를 객체로 덮는 것은 구조 변경이다 — 포기한다.
    if (!init?.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
    cur = init;
    at += 1;
  }
  const remaining = segments.slice(at).join(SEP);
  if (remaining === "") return false;
  cur.addPropertyAssignment({ name: quoteName(remaining), initializer: JSON.stringify(value) });
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
