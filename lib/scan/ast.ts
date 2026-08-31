import { Project, SyntaxKind, type CallExpression, type Node, type SourceFile } from "ts-morph";

import type { RawCall, ScanError, WrapperId } from "./types";



/** 비리터럴 호출을 명시 등록으로 통과시키는 지시자. MVP §5.2. */
const KEYS_DIRECTIVE = /^\s*\/\/\s*@l10n-keys\s+(.+)$/;
/** 번역자용 설명. §3.1이 약속한 description의 유일한 공급원이다. */
const DESC_DIRECTIVE = /^\s*\/\/\s*@l10n-desc\s+(.+)$/;

/**
 * 래퍼는 **모듈 경로 + export 이름**으로 식별한다. 이름만으로 매칭하면 대상 리포에 이미 있는
 * 다른 `t()`를 우리 것으로 착각한다 — bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만
 * 보면 기존 호출 1391건이 오탐이 됐다. **모듈 경로도 충돌할 수 있으므로**(bugshot-2의 래퍼가
 * 하필 `@/i18n#t`다) 호출부가 값을 넘긴다 — 대상 리포의 관례를 스캐너가 알 수 없다.
 *
 * **AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지
 * 못한다. 스캐너가 키의 유일한 진실 공급원이므로 오탐이 곧 살아 있는 키의 orphaned 오설정이고,
 * 누락은 문자열 소실이다 (ARCHITECTURE §4).
 *
 * ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다 —
 * 그게 이 경로의 핵심 이득이다.
 */
export function extractCalls(
  path: string,
  code: string,
  wrapper: WrapperId,
): { calls: RawCall[]; whitelisted: string[]; errors: ScanError[] } {
  // 파일마다 Project를 새로 만들지 않고 in-memory FS 하나를 쓴다. 타입 정보가 필요 없어
  // (호출 형태만 본다) 컴파일러 옵션·lib을 로드하지 않는다 — 수백 파일에서 이게 속도를 좌우한다.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
  const sourceFile = project.createSourceFile(path, code, { overwrite: true });

  const lines = code.split("\n");
  const calls: RawCall[] = [];
  const errors: ScanError[] = [];

  // 이 파일이 래퍼를 import했는가. 안 했으면 여기 있는 t()는 남의 것이므로 손대지 않는다.
  const localName = wrapperLocalName(sourceFile, wrapper);
  if (localName === undefined) return { calls, whitelisted: collectWhitelist(lines), errors };

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== localName) continue;

    const line = lineOf(sourceFile, call);
    const args = call.getArguments();

    if (args.length < 2) {
      errors.push({ path, line, message: `t() 인자가 부족하다 — t(key, source) 형태여야 한다` });
      continue;
    }

    const key = literalOf(args[0]);
    const sourceText = literalOf(args[1]);

    if (key === undefined || sourceText === undefined) {
      // 비리터럴이다. 위쪽 @l10n-keys가 있으면 이 호출은 그 지시자가 대신 신고한 것으로 본다.
      if (findDirective(lines, line, KEYS_DIRECTIVE) !== undefined) continue;
      errors.push({
        path,
        line,
        message:
          `t()의 ${key === undefined ? "키" : "원문"} 인자가 문자열 리터럴이 아니다. ` +
          `동적 키는 위 줄에 \`// @l10n-keys a, b\`로 명시 등록한다`,
      });
      continue;
    }

    const description = findDirective(lines, line, DESC_DIRECTIVE);
    calls.push(description === undefined
      ? { key, sourceText, path, line }
      : { key, sourceText, path, line, description });
  }

  return { calls, whitelisted: collectWhitelist(lines), errors };
}

/**
 * 래퍼가 이 파일에서 불리는 이름. `import { t } from "@/i18n"`이면 `"t"`,
 * `import { t as translate }`면 `"translate"`. import가 없으면 `undefined`.
 *
 * 타입 정보 없이 import 선언만 본다 — 컴파일러를 돌리지 않으므로 수백 파일에서도 빠르다.
 */
function wrapperLocalName(sourceFile: SourceFile, wrapper: WrapperId): string | undefined {
  for (const decl of sourceFile.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== wrapper.module) continue;
    for (const spec of decl.getNamedImports()) {
      if (spec.getName() !== wrapper.export) continue;
      return spec.getAliasNode()?.getText() ?? spec.getName();
    }
  }
  return undefined;
}

/**
 * 지시자는 호출과 독립적으로 수집한다 — 해당 호출이 에러로 걸러졌거나 래퍼 import가 없어도
 * 명시 등록된 키는 존재해야 한다(그게 명시 등록의 목적이다).
 */
function collectWhitelist(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const m = KEYS_DIRECTIVE.exec(raw);
    if (!m?.[1]) continue;
    for (const name of m[1].split(",")) {
      const trimmed = name.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function lineOf(sourceFile: SourceFile, call: CallExpression): number {
  return sourceFile.getLineAndColumnAtPos(call.getStart()).line;
}

/** 문자열 리터럴이면 값, 아니면 undefined. 템플릿 리터럴은 치환이 없어도 거부한다 —
 *  허용하면 "치환이 있는 경우"와 형태로 구분되지 않아 규칙이 흐려진다. */
function literalOf(arg: Node | undefined): string | undefined {
  if (!arg) return undefined;
  return arg.isKind(SyntaxKind.StringLiteral) ? arg.getLiteralValue() : undefined;
}

/** 호출 줄 바로 위에서 시작해 위로 올라가며 지시자를 찾는다(빈 줄·다른 주석은 통과). */
function findDirective(lines: string[], callLine: number, pattern: RegExp): string | undefined {
  for (let i = callLine - 2; i >= 0; i--) {
    const raw = lines[i];
    if (raw === undefined) break;
    const m = pattern.exec(raw);
    if (m?.[1]) return m[1].trim();
    // 주석·빈 줄이 아니면 탐색을 멈춘다 — 멀리 떨어진 지시자가 엉뚱한 호출에 붙는 걸 막는다.
    if (raw.trim() !== "" && !raw.trim().startsWith("//")) break;
  }
  return undefined;
}
