import { Project, SyntaxKind, type CallExpression, type Node, type SourceFile } from "ts-morph";

import type { KeyRef, ScanWarning, WrapperId } from "./types";

/** 비리터럴 호출을 명시 등록으로 통과시키는 지시자. */
const KEYS_DIRECTIVE = /^\s*\/\/\s*@l10n-keys\s+(.+)$/;

/**
 * `chrome.i18n.getMessage("key")` 직접 호출. 래퍼가 없는 리포에서도 사용처를 얻는다 —
 * 적재가 래퍼에 의존하지 않으므로 스캔도 의존하지 않아야 한다.
 */
const CHROME_CALL = "chrome.i18n.getMessage";

/**
 * **AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지
 * 못한다. ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다.
 *
 * **래퍼는 모듈 경로 + export 이름으로 식별한다.** 이름만으로 매칭하면 대상 리포에 이미 있는
 * 다른 `t()`를 우리 것으로 착각한다 — bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만
 * 보면 기존 호출 1391건이 오탐이 됐다. 모듈 경로도 충돌할 수 있어(그 리포의 래퍼가 하필
 * `@/i18n#t`다) 호출부가 값을 넘긴다.
 */
export function extractRefs(
  path: string,
  code: string,
  wrapper: WrapperId,
): { found: Array<{ key: string; ref: KeyRef }>; warnings: ScanWarning[] } {
  // 타입 정보가 필요 없어(호출 형태만 본다) 컴파일러 옵션·lib을 로드하지 않는다 —
  // 수백 파일에서 이게 속도를 좌우한다.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
  const sourceFile = project.createSourceFile(path, code, { overwrite: true });

  const lines = code.split("\n");
  const found: Array<{ key: string; ref: KeyRef }> = [];
  const warnings: ScanWarning[] = [];

  // 이 파일이 래퍼를 import했는가. 안 했으면 여기 있는 t()는 남의 것이므로 손대지 않는다.
  const localName = wrapperLocalName(sourceFile, wrapper);

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    const isWrapper = localName !== undefined && callee === localName;
    const isChrome = callee === CHROME_CALL;
    if (!isWrapper && !isChrome) continue;

    const line = lineOf(sourceFile, call);
    const key = literalOf(call.getArguments()[0]);

    if (key === undefined) {
      // 위쪽 @l10n-keys가 있으면 그 지시자가 이 호출의 키를 대신 신고한 것으로 본다.
      if (hasDirectiveAbove(lines, line)) continue;
      warnings.push({
        path,
        line,
        message:
          `${callee}()의 키 인자가 문자열 리터럴이 아니라 사용처를 특정할 수 없다. ` +
          `위 줄에 \`// @l10n-keys a, b\`로 명시 등록하면 잡힌다`,
      });
      continue;
    }

    found.push({ key, ref: { path, line } });
  }

  // 지시자는 호출과 독립적으로 수집한다 — 해당 호출이 경고로 걸러졌거나 래퍼 import가 없어도
  // 명시 등록된 키는 사용처를 가져야 한다(그게 명시 등록의 목적이다).
  for (const [index, raw] of lines.entries()) {
    const m = KEYS_DIRECTIVE.exec(raw);
    if (!m?.[1]) continue;
    for (const name of m[1].split(",")) {
      const key = name.trim();
      if (key) found.push({ key, ref: { path, line: index + 1 } });
    }
  }

  return { found, warnings };
}

function lineOf(sourceFile: SourceFile, call: CallExpression): number {
  return sourceFile.getLineAndColumnAtPos(call.getStart()).line;
}

/**
 * 문자열 리터럴이면 값, 아니면 undefined. 템플릿 리터럴은 치환이 없어도 거부한다 —
 * 허용하면 "치환이 있는 경우"와 형태로 구분되지 않아 규칙이 흐려진다.
 */
function literalOf(arg: Node | undefined): string | undefined {
  if (!arg) return undefined;
  return arg.isKind(SyntaxKind.StringLiteral) ? arg.getLiteralValue() : undefined;
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

/** 호출 줄 바로 위에서 위로 올라가며 지시자를 찾는다(빈 줄·다른 주석은 통과). */
function hasDirectiveAbove(lines: readonly string[], callLine: number): boolean {
  for (let i = callLine - 2; i >= 0; i--) {
    const raw = lines[i];
    if (raw === undefined) return false;
    if (KEYS_DIRECTIVE.test(raw)) return true;
    // 주석·빈 줄이 아니면 멈춘다 — 멀리 떨어진 지시자가 엉뚱한 호출에 붙는 걸 막는다.
    if (raw.trim() !== "" && !raw.trim().startsWith("//")) return false;
  }
  return false;
}
