import {
  Project,
  SyntaxKind,
  type Expression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  type StringLiteral,
} from "ts-morph";

import { KEY_SEP } from "./json-style";
import { dominantQuote, quoteLiteral, quoteOf, type Quote } from "./quote-style";
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
 * `docs/ARCHITECTURE §1.9` 판정 ③.
 *
 * ⚠️ **`ts-dict`와 다른 어댑터다.** 같은 ts-morph를 쓰지만 전제가 반대다:
 * - `ts-dict` — 한 파일 안에 로케일 객체가 여러 개(`const ko`, `const en`). bugshot-2의 관례.
 * - `code-dict` — 파일 하나 = 로케일 하나. 생태계의 관례.
 *
 * ⚠️ **`per-locale` + 수술적 치환이다.** 값만 갈아끼운다 — element-plus의 `// to be translated`
 * 같은 줄 끝 주석이 재생성에서 전부 사라진다 (ARCHITECTURE §1.4).
 */

const SEP = KEY_SEP;
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

/** probe 없이 나오는 후보 그룹 — `<dir>{locale}.<ext>` 템플릿과 그 로케일 집합. 순위순이다. */
export type CodeDictGroup = { pathTemplate: string; locales: ReadonlySet<string> };

/**
 * `detectCandidates`의 **probe 이전 부분** — 경로만으로 만들 수 있는 후보 그룹을 순위순으로 낸다.
 *
 * 분리해 export한 이유 (2026-09-07, 온보딩 design §3.1): 서버는 GitHub API라 동기 probe가 없고, code-dict는
 * probe 없이 후보 0개라 **내려받을 파일을 고를 근거가 없다.** 이 함수로 그룹을 먼저 얻어 상위 몇 개의 샘플을
 * 내려받고, 그 내용을 probe로 만들어 `detectCandidates`를 다시 돈다. 정규식을 `lib/onboarding/`에 복사하지
 * 않는다 — 공급층이 두 벌이면 POSTMORTEM 2026-09-02의 형태다.
 *
 * ⚠️ **판정 불변.** `detectCandidates`가 이 함수를 그대로 부르고 probe 검증만 얹는다 —
 * `__tests__/code-dict-paths.test.ts`가 부분집합·순서 보존을 단언한다. `lib/adapters/**` 변경이지만 재측정
 * 트리거가 아니다.
 */
export function codeDictCandidatePaths(paths: readonly string[]): CodeDictGroup[] {
  /** `dir\0ext` → 로케일 집합 */
  const byDir = new Map<string, Set<string>>();
  for (const path of paths) {
    const m = CODE_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", base = "", ext = "ts"] = m;
    if (!looksLikeLocale(base)) continue;
    // 경로에 없는 문자로 잇는다 — 공백으로 이으면 `my app/locale/`가 쪼개진다 (2026-09-04 audit #12).
    const key = `${dir}\u0000${ext}`;
    const set = byDir.get(key) ?? new Set();
    set.add(base);
    byDir.set(key, set);
  }

  return rankCandidates(
    [...byDir.entries()]
      // 강한 로케일 코드가 하나도 없으면 로케일 모음이 아니다 — `shared.hasStrongLocale`.
      .filter(([, s]) => s.size >= 2 && hasStrongLocale(s))
      .map(([key, locales]) => ({ dir: key.split("\u0000")[0] ?? "", ext: key.split("\u0000")[1] ?? "ts", locales })),
  ).map(({ dir, ext, locales }) => ({ pathTemplate: `${dir}{locale}.${ext}`, locales }));
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  // 경로만으로는 판단할 수 없다 — 로케일 이름 소스 파일은 어디에나 있다. **내용을 봐야 한다.**
  if (!probe) return [];

  const found: DetectedFormat[] = [];
  for (const { pathTemplate, locales } of codeDictCandidatePaths(paths)) {
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
      // 탐지 단계다 — 파싱이 던지는 파일은 "카탈로그 아님"으로 셈한다. 사유는 read가 다시 만나 에러로 낸다.
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
        errors.push({ path: file.path, code: "parse-failed", detail: syntax[0]?.getMessageText()?.toString() ?? "unknown" });
        continue;
      }
      obj = defaultExportObject(sf);
    } catch (cause) {
      errors.push({ path: file.path, code: "parse-crashed", detail: (cause as Error).message });
      continue;
    }
    if (obj === undefined) {
      errors.push({ path: file.path, code: "no-default-export" });
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
 * `orphaned` 오인으로 번진다 (`docs/ARCHITECTURE §1.9` §3 계열).
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
      errors.push({ path, code: "shorthand-property", key: prop.getName() });
      continue;
    }
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
      errors.push({ path, code: "not-property-assignment", key: prop.getText().slice(0, 40) });
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
    errors.push({ path, code: "value-not-string-literal", key, detail: init?.getKindName() ?? "none" });
  }
}

/** 프로퍼티 이름이 식별자로 쓸 수 있는가. 아니면 따옴표로 감싼다. */
const PLAIN_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

/**
 * ⚠️ **파싱 실패·default export 부재는 "변경 없음"이 아니다.** 원본을 그대로 돌려주되 에러로 알린다 —
 * `write`만 부르면 호출부가 blob SHA가 같다고 읽어 그 파일이 PR에서 조용히 빠진다.
 */
function writeWithErrors(
  format: DetectedFormat,
  input: WriteInput,
): { content: string | null; errors: AdapterError[] } {
  const file = format.currentFiles?.[0];
  if (!file) return { content: null, errors: [] };

  let sf: SourceFile;
  let root: ObjectLiteralExpression | undefined;
  try {
    const project = newProject();
    sf = project.createSourceFile(file.path, file.content, { overwrite: true });
    // read와 같은 진단이다 — write만 빠져 있어 깨진 원본에 치환하면 복구된 AST가 찍혀 나갔다
    // (2026-09-04 audit #9).
    const syntax = project.getProgram().getSyntacticDiagnostics(sf)[0];
    if (syntax !== undefined) {
      return {
        content: file.content,
        errors: [{ path: file.path, code: "write-parse-failed", detail: syntax.getMessageText()?.toString() ?? "unknown" }],
      };
    }
    root = defaultExportObject(sf);
  } catch (cause) {
    return { content: file.content, errors: [{ path: file.path, code: "write-parse-failed", detail: (cause as Error).message }] };
  }
  if (root === undefined) {
    return { content: file.content, errors: [{ path: file.path, code: "write-no-default-export" }] };
  }

  const wanted = new Map<string, string>();
  for (const e of input.entries) {
    // orphaned·빈 값은 원본 값을 남긴다 (ARCHITECTURE §1.4).
    if (e.orphaned === true || e.message === "") continue;
    wanted.set(e.key, e.message);
  }

  let changed = false;
  const errors: AdapterError[] = [];
  const missing: string[] = [];
  for (const [key, value] of wanted) {
    const target = findScalar(root, key);
    if (target === undefined) {
      missing.push(key);
      continue;
    }
    // 문자열 리터럴이 아닌 자리는 건드리지 않는다. **다만 조용히 버리지 않는다** — 값을 잃더라도
    // 어느 키에서 잃었는지 알려주는 것이 최소 조건이다 (ARCHITECTURE §1.35).
    if (target === "not-a-literal") {
      errors.push({ path: file.path, code: "write-slot-not-string-literal", key });
      continue;
    }
    if (target.getLiteralValue() === value) continue;
    // ⚠️ `setLiteralValue`는 이스케이프하지 않는다 — 백슬래시·개행·따옴표가 재파싱에서 깨진다.
    // `quoteLiteral`이 `JSON.stringify`로 안전한 리터럴을 만들되 **원본의 인용 부호로** 낸다 —
    // 큰따옴표로 고정하면 작은따옴표 리포에서 편집한 줄만 튀어 lint를 깨뜨린다 (§1.4).
    target.replaceWithText(quoteLiteral(value, quoteOf(target.getText())));
    changed = true;
  }

  // 없는 키는 삽입한다 — **정렬 순서로 넣어야 결정적이다** (ARCHITECTURE §1.4).
  // 삽입에는 대응하는 원본 리터럴이 없으므로 **파일의 다수 부호**를 쓴다. 삽입한 줄만 튀면
  // 편집 줄의 부호를 맞춘 의미가 없어진다.
  const quote = dominantQuote(sf.getDescendantsOfKind(SyntaxKind.StringLiteral).map((n) => n.getText()));
  for (const key of missing.sort(compareKeys)) {
    const value = wanted.get(key);
    if (value === undefined) continue;
    if (insert(root, key, value, quote)) {
      // 원문 범위 치환은 기존 AST 노드를 무효화한다. 다음 키는 새 트리에서 찾는다.
      root = defaultExportObject(sf)!;
      changed = true;
      continue;
    }
    // 문자열 자리를 객체로 덮는 삽입은 구조 변경이라 포기한다 — 그 사실을 보고한다.
    errors.push({ path: file.path, code: "write-slot-missing", key });
  }

  return { content: changed ? sf.getFullText() : file.content, errors };
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
function insert(obj: ObjectLiteralExpression, key: string, value: string, quote: Quote): boolean {
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
  const source = cur.getSourceFile().getFullText();
  const start = cur.getStart();
  const close = cur.getEnd() - 1;
  const properties = cur.getProperties();
  const last = properties.at(-1);
  const trailingComma = cur.compilerNode.properties.hasTrailingComma === true;
  const closeLine = source.lastIndexOf("\n", close - 1) + 1;
  const closeIndent = source.slice(closeLine, close);
  const multiline = closeLine > start && /^[\t ]*$/.test(closeIndent);
  const property = `${quoteName(remaining, quote)}: ${quoteLiteral(value, quote)}${trailingComma ? "," : ""}`;
  let position: number;
  let insertion: string;
  if (multiline) {
    // 가장 가까운 형제의 들여쓰기를 그대로 쓴다 — ts-morph 기본 폭으로 반올림하지 않는다.
    const siblingIndent = [...properties].reverse().map((prop) => {
      const line = source.lastIndexOf("\n", prop.getStart() - 1) + 1;
      return source.slice(line, prop.getStart());
    }).find((prefix) => /^[\t ]*$/.test(prefix));
    // 빈 여러 줄 객체는 파일의 첫 프로퍼티 들여쓰기를 단서로 삼는다.
    // 그것도 없으면 닫는 괄호 + 2칸, 끝 쉼표 없음으로 시작한다.
    const fileIndent = cur.getSourceFile().getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .map((prop) => source.slice(source.lastIndexOf("\n", prop.getStart() - 1) + 1, prop.getStart()))
      .find((prefix) => /^[\t ]+$/.test(prefix));
    const indent = siblingIndent ?? closeIndent + (fileIndent ?? "  ");
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    position = closeLine;
    insertion = `${indent}${property}${newline}`;
  } else {
    // 빈 한 줄 객체는 원래 안쪽 여백을 쓰고 한 줄·끝 쉼표 없음으로 시작한다.
    const space = source.slice(start + 1).match(/^[\t ]*/)?.[0] ?? "";
    const tailSpace = source.slice(start + 1, close).match(/[\t ]*$/)?.[0] ?? "";
    position = close - tailSpace.length;
    insertion = `${space}${property}`;
  }
  let text = source.slice(start, position) + insertion + source.slice(position, cur.getEnd());
  if (last !== undefined && !trailingComma) {
    const commaAt = last.getEnd() - start;
    text = text.slice(0, commaAt) + "," + text.slice(commaAt);
  }
  // 객체를 재포맷하면 기존 주석·빈 줄·개행 코드까지 바뀌므로 원본 구간만 치환한다.
  cur.getSourceFile().applyTextChanges([{ span: { start, length: cur.getEnd() - start }, newText: text }]);
  return true;
}

/** 식별자로 쓸 수 있으면 부호 없이, 아니면 **값과 같은 부호로** 감싼다 — 키만 튀지 않게 한다. */
const quoteName = (name: string, quote: Quote) =>
  PLAIN_NAME.test(name) ? name : quoteLiteral(name, quote);

export const codeDict: Adapter = {
  name: "code-dict",
  layout: "per-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
};
