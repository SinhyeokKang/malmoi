import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";

import { quoteLiteral, quoteOf } from "./quote-style";
import { compareKeys, hasStrongLocale, looksLikeLocale, pathSignals } from "./shared";
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
 * 사람이 의미 단위로 넣은 빈 줄(120개)과 주석(23개)이 사라진다 (ARCHITECTURE §1.1).
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
      errors.push({ path, code: "value-not-string-literal", key, detail: init?.getKindName() ?? "none" });
      continue;
    }
    out.push({ key, value: init.getLiteralValue(), assignment: prop });
  }
  return out;
}

/**
 * ⚠️ **자동 탐지 참여 여부가 2026-09-14에 뒤집혔다** (ARCHITECTURE §1.9 판정 ③).
 *
 * 2026-09-02에 자동 탐지에서 뺐던 근거는 *"오픈소스 109개에서 후보에 0회"* 와 *"`.ts` 디렉터리마다
 * ts-morph를 돌리는 probe 비용"* 이었다. **2026-09-14에 되돌렸다** — 그 대가로 bugshot-2에서 903키
 * 딕셔너리가 4키 `_locales` 뒤에 숨어 화면에 아예 안 떴고(PRODUCT §7.3이 그 상황을 적어 뒀다),
 * probe 비용은 아래 `tsDictProbePaths`의 `I18N_HINT` 좁힘이 대신 든다.
 *
 * ⚠️ **`detect`와 `detectCandidates`가 같은 함수를 지난다.** 갈라 두면 "후보에는 있는데 고르면 안
 * 되는 포맷"이 생긴다. 2026-09-03에는 반대 방향으로 갈려 있었다 — `detect`도 빈 배열을 거쳐
 * `--adapter ts-dict`가 "해당 포맷을 찾지 못했다"로 죽었고, "ADAPTERS에 남아 있다"만 검사하는
 * 테스트가 그걸 가렸다.
 */
/**
 * 디렉터리당 내려받아 볼 파일 수. `detectByContent`가 읽는 수와 **같아야 한다**.
 *
 * ⚠️ **8인 이유는 미리보기 숫자다** (2026-09-14 실측). 4였을 때 bugshot-2의 네임스페이스 8개 중
 * 절반만 읽어 화면이 **267키**를 보였는데 첫 적재는 **907키**였다 — 사용자가 후보를 고르는 근거가
 * 그 숫자인데 절반이면 "4키"만큼은 아니어도 여전히 거짓이다. 더 큰 리포에서는 표본이 남는다.
 */
const SEED_FILES = 8;
/**
 * 씨앗으로 고를 디렉터리 수. blob 예산은 비용이 아니라 응답 시간이다 (온보딩 `maxDuration` 60초,
 * 다운로드가 **순차**다).
 *
 * ⚠️ **셋째 이후 디렉터리는 "검증 실패"가 아니라 미검증으로 사라진다** — 화면에도 로그에도 흔적이
 * 없다 (2026-09-14 2차 리뷰 🟡6). 정렬이 얕은 쪽 우선이라 모노레포에서 깊은 진짜 딕셔너리가
 * 체계적으로 진다: `src/i18n/*.ts`(유틸) + `src/locales/*.ts`(상수)가 앞서면
 * `packages/app/src/i18n/namespaces/*.ts`는 안 뜬다. **그때의 길은 수동 지정이다.**
 */
const SEED_DIRS = 2;

/**
 * **경로만 보는 씨앗** — 내려받아 볼 `.ts` 파일을 고른다 (2026-09-14).
 *
 * ⚠️ **이것이 없으면 `detectCandidates`를 켜도 화면에 안 뜬다.** 온보딩은 2패스이고 1패스는 경로만
 * 보는데 이 어댑터는 **내용을 봐야** 판단할 수 있어 1패스 후보가 0이다 → 그 파일이 내려받을 목록에
 * 안 실리고 → 2패스에도 내용이 없어 또 0이다. `code-dict`의 `codeDictCandidatePaths`와 같은 자리다.
 *
 * ⚠️ **씨앗은 후보가 아니다 — 판정은 내용이 한다.** bugshot-2의 `src/i18n/`이 그 증거다: 씨앗에는
 * 들어오지만 파일마다 로케일 객체가 하나뿐이라 2패스에서 스스로 떨어진다.
 *
 * ⚠️ **`I18N_HINT`로 좁히는 것이 예산의 전부다.** `.ts` 디렉터리는 어디에나 있어서(bugshot-2에 40여 개)
 * 신호 없이 고르면 blob이 수십 개가 된다. 곁가지(`__tests__`·`examples`)는 `aside`가 걷어낸다.
 */
export function tsDictProbePaths(paths: readonly string[]): string[] {
  const byDir = new Map<string, string[]>();
  for (const path of paths) {
    const m = NS_DIR.exec(path);
    const dir = m?.[1];
    if (dir === undefined) continue;
    const { hint, aside } = pathSignals(path);
    if (!hint || aside) continue;
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(path);
  }

  const dirs = [...byDir.entries()]
    // 파일이 하나뿐이면 딕셔너리가 아니다 — `detectByContent`도 로케일 객체 2개 이상을 요구한다.
    .filter(([, files]) => files.length >= 2)
    // 얕은 쪽이 진짜일 가능성이 높다(`pathSignals`의 같은 신호), 같으면 경로순으로 결정적이게.
    .sort(([a], [b]) => pathSignals(a).depth - pathSignals(b).depth || compareKeys(a, b))
    .slice(0, SEED_DIRS);

  return dirs.flatMap(([, files]) => files.slice().sort(compareKeys).slice(0, SEED_FILES));
}

/**
 * ⚠️ **2026-09-14에 되살렸다 — 내용 탐지를 그대로 부른다.** 자동 탐지와 명시 지정이 갈리면 "후보에는
 * 있는데 고르면 안 되는 포맷"이 생긴다. probe가 없으면 `detectByContent`가 빈 배열을 내므로
 * **1패스(경로만)에서는 여전히 아무것도 안 낸다** — 그 자리를 메우는 것이 위 `tsDictProbePaths`다.
 */
function detectCandidates(paths: readonly string[], probe?: (p: string) => string | undefined): DetectedFormat[] {
  return detectByContent(paths, probe);
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
    // ⚠️ **씨앗이 내려받은 것과 같은 파일을 읽어야 한다**(`SEED_FILES`개, 같은 정렬) — 다른 것을
    // 보면 후보가 "검증 실패"가 아니라 **미검증으로 통째로** 떨어진다.
    for (const path of files.slice().sort(compareKeys).slice(0, SEED_FILES)) {
      const content = probe(path);
      if (content === undefined) continue;
      const sf = newProject().createSourceFile(path, content, { overwrite: true });
      const objs = localeObjects(sf);
      // 로케일 이름 선언이 2개 이상이어야 딕셔너리로 인정한다.
      if (objs.size < 2) continue;
      matched += 1;
      for (const name of objs.keys()) locales.add(name);
    }
    /**
     * ⚠️ **강한 로케일이 하나는 있어야 한다** (2026-09-14 — 자동 탐지에 들어오면서 필요해졌다).
     * `localeObjects`는 변수명을 `looksLikeLocale`(2~3자 소문자)로만 거르는데, i18n 디렉터리의 유틸
     * 파일에는 `fmt`·`map`·`ctx`·`raw` 같은 상수가 흔하다 — 그 둘이 잡히면 **기준 언어 라디오에
     * `fmt`/`map`이 뜬다.** 나머지 네 어댑터의 그룹 필터는 전부 이 관문을 지나고, 명시 지정
     * 전용이던 동안에는 사람이 경로를 보고 골라서 이 어댑터만 밖에 있어도 무해했다.
     */
    if (matched === 0 || locales.size < 2 || !hasStrongLocale(locales)) continue;
    found.push({ adapter: "ts-dict", pathTemplate: `${dir}*.ts`, locales: [...locales] });
  }
  return found;
}

/**
 * 명시 지정(`detectFormatWith("ts-dict", …)`)의 1순위. **`detectCandidates`와 같은 내용 탐지를
 * 지난다** — 2026-09-14 전에는 이쪽만 그랬다(그때 자동 탐지는 빈 배열이었다).
 */
function detect(paths: readonly string[], probe?: (p: string) => string | undefined): DetectedFormat | undefined {
  return detectByContent(paths, probe)[0];
}

/**
 * 내용 탐지 그 자체. ⚠️ **`detectCandidates`가 이 함수를 부른다** — 별칭이라 두 진입점이 갈릴 수
 * 없다. 2026-09-14 전에는 "자동 탐지에서 빠진 로직, 되살리려면 부를 것"이었다.
 */
export const tsDictDetectByContent = detectByContent;

/** 첫 구문 진단 메시지. 타입 진단은 lib 로드가 필요하고 여기선 의미가 없다 — 구문만 본다. */
function syntaxError(project: Project, sf: SourceFile): string | undefined {
  const first = project.getProgram().getSyntacticDiagnostics(sf)[0];
  return first === undefined ? undefined : (first.getMessageText()?.toString() ?? "unknown");
}

function read(_format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const byLocale = new Map<string, LocaleEntry[]>();
  const errors: AdapterError[] = [];

  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue;
    const project = newProject();
    const sf = project.createSourceFile(file.path, file.content, { overwrite: true });
    // ⚠️ TS 파서는 던지지 않고 복구한다 — 진단을 안 보면 깨진 파일에서 부분 적재가 `errors: 0`으로
    // 통과하고 나머지 키가 orphaned로 떨어진다. `code-dict.read`와 같은 계약 (§1.35).
    const syntax = syntaxError(project, sf);
    if (syntax !== undefined) {
      errors.push({ path: file.path, code: "parse-failed", detail: syntax });
      continue;
    }
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

  const project = newProject();
  const sf = project.createSourceFile(file.path, file.content, { overwrite: true });
  const errors: AdapterError[] = [];
  // write도 read와 같은 진단을 본다 — 깨진 원본에 치환하면 복구된 AST를 다시 찍어 파일이 바뀐다.
  const syntax = syntaxError(project, sf);
  if (syntax !== undefined) {
    return { content: file.content, errors: [{ path: file.path, code: "write-parse-failed", detail: syntax }] };
  }
  const obj = localeObjects(sf).get(input.locale);
  // **로케일 객체가 없는 것을 성공으로 처리하지 않는다.** 그 로케일의 번역이 통째로 반영되지
  // 않는데 호출부는 "변경 없음"으로 읽어 파일이 PR에서 조용히 빠진다 (ARCHITECTURE §1.35).
  if (!obj) {
    return {
      content: file.content,
      errors: [{ path: file.path, code: "write-locale-object-missing", key: input.locale }],
    };
  }

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
